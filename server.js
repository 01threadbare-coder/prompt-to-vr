
require("dotenv").config();

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { PDFParse } = require("pdf-parse");
const { fal } = require("@fal-ai/client");

const app = express();
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3001);
const PUBLIC = path.join(__dirname, "public");
const UPLOADS = path.join(__dirname, "uploads");

fs.mkdirSync(PUBLIC, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

if (!process.env.FAL_KEY) {
  throw new Error("FAL_KEY is missing. Check your .env file.");
}

fal.config({ credentials: process.env.FAL_KEY });

app.use(express.json({ limit: "30kb" }));
app.use(express.static(PUBLIC));

const upload = multer({
  dest: UPLOADS,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" &&
      path.extname(file.originalname).toLowerCase() === ".pdf";

    if (!isPdf) {
      return cb(new Error("Please upload a PDF file."));
    }

    cb(null, true);
  }
});

let job = {
  status: "idle",
  message: "Ready to create an immersive lesson.",
  videoUrl: null
};

let isGenerating = false;

// STEP 1: Use AI to expand the teacher's simple idea.
async function enhancePromptWithAI(teacherPrompt, documentText = "") {
  const lessonContext = documentText.trim()
    ? `\nLESSON MATERIAL (use as the factual source):\n${documentText.slice(0, 3500)}`
    : "\nNo PDF was supplied. Use established, reliable knowledge and avoid unsupported details.";

  const inputConcept = `You are writing a detailed prompt for a short educational 360-degree VR video.

TEACHER'S IDEA:
${teacherPrompt}
${lessonContext}

Expand the idea into a visually specific, scientifically accurate scene.
Describe the environment surrounding the viewer, spatial layout, scale,
textures, lighting, depth and important visible structures.

Define the action over time:
- What is visible at the beginning?
- What moves, and in which direction?
- How does the process develop during the clip?
- What is visible at the end?

Describe continuous, understandable movement. Keep objects, anatomy,
scale and spatial relationships consistent between frames.

This is an immersive 360-degree educational experience, not a conventional
cinematic shot. The viewer stays at a stationary viewpoint. Do not request
camera travel, spinning, rapid zooms or sudden cuts. Movement should come
from the subject and environment, not the camera.

Prioritise the learning objective and supplied lesson material. Do not
invent unsupported scientific facts. Focus on one meaningful stage if
the topic is too broad for a five-second clip.

Return only the finished video prompt.`;

  try {
    console.log("Enhancing teacher prompt with fal.ai...");

    const result = await fal.subscribe(
      "fal-ai/video-prompt-generator",
      {
        input: {
          input_concept: inputConcept,
          style: "Detailed",
          camera_style: "VR 360",
          camera_direction: "None",
          pacing: "Continuous flow",
          special_effects: "None",
          custom_elements:
            "Complete equirectangular 360-degree environment; " +
            "consistent panorama in all directions; stationary viewer; " +
            "coherent scene; continuous subject motion; educational " +
            "accuracy; no text overlays.",
          model: "google/gemini-2.5-flash-lite",
          prompt_length: "Long"
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            console.log("AI prompt enhancement is processing...");
          }
        }
      }
    );

    const enhancedPrompt = result?.data?.prompt?.trim();

    if (!enhancedPrompt) {
      throw new Error("The prompt enhancer returned an empty prompt.");
    }

    console.log("AI prompt enhancement completed.");
    console.log(
      "AI-enhanced description length:",
      enhancedPrompt.length,
      "characters"
    );

    return enhancedPrompt;

  } catch (error) {
    console.error("AI prompt enhancement failed:", error.message);
    console.log(
      "Using the teacher's original description with the VR instruction template."
    );

    // Keep the original workflow usable if enhancement fails.
    return teacherPrompt;
  }
}

// STEP 2: Combine the AI description with fixed VR requirements.
function buildEnhancedPrompt(
  teacherPrompt,
  documentText = "",
  aiDescription = ""
) {
  const source = documentText.trim()
    ? documentText.slice(0, 3500)
    : "No PDF provided. Use established knowledge relevant to the request.";

  return `equirect360.

PURPOSE:
Create one immersive 360-degree educational video that directly
illustrates the teacher's learning objective.

TEACHER'S ORIGINAL REQUEST:
${teacherPrompt}

AI-ENHANCED SCENE DESCRIPTION:
${aiDescription || teacherPrompt}

LESSON SOURCE:
${source}

SCENE AND SPATIAL DESIGN:
Create one coherent environment, not a montage of unrelated locations.
Place the viewer at a clear, stationary viewpoint within the environment.
Specify surrounding structures, foreground, middle distance, background,
surfaces, textures, scale, depth, lighting and spatial relationships.
The environment must surround the viewer in every direction.

SCIENTIFIC AND EDUCATIONAL ACCURACY:
Prioritise facts and concepts supported by the lesson source.
Represent anatomy, biological structures and physical processes plausibly.
Do not invent unsupported facts or add unrelated scenery.
Make the important learning concept visually recognisable.
Focus on one meaningful stage if the subject is too broad for one short clip.

CONTINUOUS MOTION:
Describe the beginning, development and end of the visible action.
Show purposeful movement with a defined direction and plausible speed.
Keep important objects, anatomy, scale and spatial relationships consistent.
Avoid static scenes, unexplained transformations and unrelated actions.
Make the main learning process visually easy to follow.

360-DEGREE PANORAMA:
Create one continuous, complete equirectangular spherical environment.
Keep the scene consistent around the viewer and across panorama edges.
The entire environment must belong to the same location.
No split-screen, collage, picture-in-picture, disconnected environments
or visible frame boundaries.

CAMERA AND COMFORT:
Keep the camera stationary at the viewer's position.
Create depth through the environment and movement of objects,
not by moving or spinning the camera.
No sudden cuts, rapid zooms, camera travel or disorienting motion.

VISUAL QUALITY:
Use clear, detailed surfaces, believable lighting, natural depth,
consistent materials and a coherent visual style.
Avoid excessive blur, warped structures, flickering objects,
malformed geometry and visual clutter.

OUTPUT:
One continuous moving 360-degree educational environment.
No titles, captions, written labels, watermarks or interface elements.
Every visible element should support the learning objective.`;
}

// Check generation status.
app.get("/api/status", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(job);
});

// Accept the teacher's prompt and optional lesson PDF.
app.post(
  "/api/generate",
  upload.single("document"),
  async (req, res) => {
    let uploadedPath = req.file?.path;
    let generationLockAcquired = false;

    try {
      if (isGenerating) {
        return res.status(409).json({
          error: "A video is already being generated. Please wait."
        });
      }

      const teacherPrompt = String(req.body.prompt || "").trim();

      if (!teacherPrompt) {
        return res.status(400).json({
          error: "Please describe the learning experience."
        });
      }

      if (teacherPrompt.length > 2000) {
        return res.status(400).json({
          error: "Please keep the teacher prompt under 2,000 characters."
        });
      }

      let documentText = "";

      if (uploadedPath) {
        const buffer = fs.readFileSync(uploadedPath);
const parser = new PDFParse({ data: buffer });

try {
  const parsed = await parser.getText();

  documentText = String(parsed.text || "")
    .trim()
    .slice(0, 3500);
} finally {
  await parser.destroy();
}

        fs.unlink(uploadedPath, () => {});
        uploadedPath = null;

        if (!documentText) {
          return res.status(400).json({
            error:
              "No selectable text was found in this PDF. Scanned PDFs need OCR."
          });
        }
      }

      // Lock before enhancement to prevent overlapping generation requests.
      isGenerating = true;
      generationLockAcquired = true;

      job = {
        status: "generating",
        message: "Enhancing your lesson prompt with AI...",
        videoUrl: null
      };

      // AI enhancement happens before the video-generation call.
      const aiDescription = await enhancePromptWithAI(
        teacherPrompt,
        documentText
      );

      const scenePrompt = buildEnhancedPrompt(
        teacherPrompt,
        documentText,
        aiDescription
      );

      console.log("Final 360-degree prompt prepared.");
      console.log(
        "Final prompt length:",
        scenePrompt.length,
        "characters"
      );

      job = {
        status: "generating",
        message:
          "Prompt enhanced. fal.ai is generating your immersive video...",
        videoUrl: null
      };

      // Respond while video generation continues in the background.
      res.json({
        accepted: true,
        message: job.message
      });

      generateVideo(scenePrompt)
        .catch((error) => {
          console.error("Background generation failed:", error.message);

          job = {
            status: "error",
            message: error.message || "Video generation failed.",
            videoUrl: null
          };
        })
        .finally(() => {
          isGenerating = false;
        });

      // The background task now owns the generation lock.
      generationLockAcquired = false;

    } catch (error) {
      console.error("Request failed:", error.message);

      if (!res.headersSent) {
        res.status(500).json({
          error: error.message || "Could not process your request."
        });
      }

    } finally {
      if (generationLockAcquired) {
        isGenerating = false;
      }

      if (uploadedPath) {
        fs.unlink(uploadedPath, () => {});
      }
    }
  }
);

// STEP 3: Generate and prepare the video using your existing model.
async function generateVideo(scenePrompt) {
  try {
    job = {
      status: "generating",
      message: "fal.ai is generating your immersive video...",
      videoUrl: null
    };

    const result = await fal.subscribe(
      "minimax/h3/text-to-video/lora",
      {
        input: {
          prompt: scenePrompt,
          duration: 15,
          resolution: "768P",
          aspect_ratio: "21:9",
          prompt_expansion_mode: "disabled",
          loras: [
            {
              path:
                "https://huggingface.co/shamanic/minimax-h3-equi360-lora/resolve/main/h3-equi360-reviewed-v2-step2500.safetensors",
              scale: 1
            }
          ]
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            console.log("fal.ai is processing the video...");
          }
        }
      }
    );

    const videoUrl = result?.data?.video?.url;

    if (!videoUrl) {
      throw new Error(
        "fal.ai completed without returning a video URL."
      );
    }

    job.message = "Video generated. Preparing it for the VR viewer...";

    const response = await fetch(videoUrl);

    if (!response.ok) {
      throw new Error(
        "Could not download the generated video from fal.ai."
      );
    }

    const videoBytes = Buffer.from(await response.arrayBuffer());

    const latestPath = path.join(PUBLIC, "latest.mp4");
    const compatiblePath = path.join(
      PUBLIC,
      "latest-compatible.mp4"
    );
    const temporaryPath = path.join(PUBLIC, "latest-new.mp4");

    fs.writeFileSync(temporaryPath, videoBytes);

    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i", temporaryPath,
        "-vf", "scale=1536:768",
"-c:v", "libx264",
"-pix_fmt", "yuv420p",
"-c:a", "aac",
"-b:a", "128k",
"-ac", "2",
"-movflags", "+faststart",
        compatiblePath
      ]);

    } catch (error) {
      throw new Error(
        "Video was generated, but FFmpeg could not prepare it. Check that FFmpeg is installed."
      );

    } finally {
      fs.unlink(temporaryPath, () => {});
    }

    // Preserve the original generated video.
    fs.writeFileSync(latestPath, videoBytes);

    job = {
      status: "completed",
      message:
        "Your new VR world is ready. Select Play experience or Enter VR.",
      videoUrl: "/latest-compatible.mp4?v=" + Date.now(),
      completedAt: new Date().toISOString()
    };

    console.log("VR video is ready.");

  } catch (error) {
    console.error("Video generation error:", error);

    job = {
      status: "error",
      message: error.message || "Video generation failed.",
      videoUrl: null
    };

    throw error;
  }
}

// Report upload and processing errors as readable JSON.
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  const status = err instanceof multer.MulterError ? 400 : 400;

  res.status(status).json({
    error: err.message || "Something went wrong."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Immersive Learning Studio running at http://localhost:${PORT}`
  );
});
