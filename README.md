# Prompt to VR — AI-Powered Educational Immersion

Prompt to VR is an educational prototype that transforms learning material into immersive 360° video experiences. Teachers can provide a written prompt or upload a PDF, and the pipeline uses AI-generated video to help students explore learning content in a more immersive way through a Meta Quest 3 headset.

## How It Works

1. **Input:** A teacher enters an educational prompt or uploads a PDF.
2. **Content Processing:** The backend extracts relevant text and prepares the video-generation request.
3. **AI Video Generation:** fal.ai is used to generate a 360° video through an AI video-generation workflow.
4. **Video Processing:** The generated video is converted into a browser-compatible MP4 while preserving audio.
5. **Immersive Experience:** The video is displayed in a 360° environment that students can explore using a Meta Quest 3 headset.

## Built With

- HTML, CSS and JavaScript
- Node.js and Express
- fal.ai for AI video generation
- FFmpeg for video processing
- A-Frame and WebXR for immersive browser-based VR
- Meta Quest 3 for viewing the experience
- ngrok for development access to the locally hosted website

## Key Features

- Teacher input through a prompt or PDF
- AI-generated 360° learning video workflow
- Immersive video playback with audio
- VR controller shortcuts for pausing, resuming and exiting the experience

## Purpose

The goal is to explore a more accessible way to turn existing educational content into immersive learning experiences, without requiring teachers to create a VR environment from scratch.

## Running Locally

The project requires Node.js, the project dependencies, FFmpeg, and a fal.ai API key configured in a local `.env` file.

1. Install dependencies with `npm install`.
2. Add your fal.ai API key to `.env` using the environment variable expected by the backend.
3. Start the server using `node server.js`.
4. Open `http://localhost:3001` in your browser.

Never commit your `.env` file or expose your API key publicly.

## Project Status

This is a working prototype exploring the integration of AI video generation and immersive VR for education.
