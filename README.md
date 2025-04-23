<a id="readme-top"></a>

<br />
<div align="center">
<h3 align="center">Right Click AI Helper</h3>

  <p align="center">
    Instantly analyze your screen content with Gemini AI using a simple hotkey!
    <br />
<br />
<a href="YOUR_REPO_LINK/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    ·
    <a href="YOUR_REPO_LINK/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#compatibility">Compatibility</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

## About The Project

**Right Click AI Helper** is a handy desktop tool that lets you quickly understand the content on your screen.

Simply press a global hotkey (default: `Ctrl+Shift+C`) or use a command in your terminal:
1.  It takes a **screenshot** of your current screen.
2.  It uses **OCR** (Optical Character Recognition) to extract any text from the screenshot using 'Tesseract.js'.
3.  It sends both the **image and the extracted text** to Google's **Gemini AI** for analysis based on your custom prompt.
4.  You get the AI's response as a **desktop notification**.

It's great for quickly summarizing articles, explaining complex diagrams, or getting insights on visual content without interrupting your workflow.



### Built With

This project relies on several key Node.js libraries:

* [![Node.js][Node.js]][Node-url]
* [@google/generative-ai](https://github.com/google/generative-ai-js) - For interacting with the Gemini API.
* [Tesseract.js](https://github.com/naptha/tesseract.js) - For performing OCR on screenshots.
* [screenshot-desktop](https://github.com/bencevans/screenshot-desktop) - For capturing the screen.
* [node-global-key-listener](https://github.com/RedKenrok/node-global-key-listener) - For listening to the global hotkey.
* [node-notifier](https://github.com/mikaelbr/node-notifier) - For displaying results as desktop notifications.
* [dotenv](https://github.com/motdotla/dotenv) - For managing environment variables (like your API key).
* [chalk](https://github.com/chalk/chalk) - For adding color to console output.



## Getting Started

Follow these steps to get the AI Helper running on your local machine.

### Prerequisites

You'll need a few things installed first:

1.  **Node.js and npm:**
    * Download and install Node.js (which includes npm) from [nodejs.org](https://nodejs.org/).
    * Verify installation by opening your terminal or command prompt and running:
        ```sh
        node -v
        npm -v
        ```

2.  **Tesseract OCR Engine:**
    * `Tesseract.js` requires the main Tesseract engine to be installed on your system. Installation varies by OS:
        * **macOS:** Use Homebrew:
            ```sh
            brew install tesseract
            brew install tesseract-lang # Installs all language data
            ```
        * **Windows:** Download an installer from the [Tesseract at UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki) page. Make sure to add Tesseract to your system's PATH during installation. You might also need to install the appropriate language data packs.
        * **Linux (Debian/Ubuntu):**
            ```sh
            sudo apt update
            sudo apt install tesseract-ocr
            sudo apt install tesseract-ocr-eng # Or other languages needed
            ```
    * *Note: The script currently uses English (`eng`) for OCR.*

3.  **Google Gemini API Key:**
    * You need an API key to use the Gemini AI model.
    * Get one for free from [Google AI Studio](https://aistudio.google.com/app/apikey).

### Installation

1.  **Clone the repository:**
    ```sh
    git clone YOUR_REPO_LINK_HERE # Replace with your actual repo link
    cd right-click-ai-helper # Or your project directory name
    ```

2.  **Install NPM packages:**
    ```sh
    npm install
    ```

3.  **Create and configure the environment file:**
    * Create a file named `.env` in the project's root directory.
    * Add your Gemini API key to this file:
        ```env
        # .env
        GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"

        # Optional: Customize other settings (defaults shown)
        # AI_MODEL="gemini-1.5-flash"
        # CUSTOM_PROMPT="Analyze the text and image from this screenshot. Provide a concise summary or answer based on the content."
        # DEBUG_MODE="false"
        # TRIGGER_KEY="{\"name\":\"C\",\"ctrl\":true,\"shift\":true,\"alt\":false,\"meta\":false}"
        ```
    * Replace `"YOUR_GEMINI_API_KEY_HERE"` with your actual key.



## Usage

1.  **Run the application:**
    Open your terminal or command prompt, navigate to the project directory, and run:
    ```sh
    node main.js
    ```
    The application will start, initialize the services, and listen for the hotkey or CLI commands.

2.  **Trigger the AI Helper:**
    * **Hotkey:** Press the configured global hotkey (default is `Ctrl+Shift+C`).
    * **CLI Command:** Type `capture` (or `c`) in the terminal where the script is running and press Enter.

3.  **Interact via CLI:**
    While the script is running, you can use these commands in the terminal:
    * `get` or `init`: Show the current configuration (API key status, model, prompt, hotkey, etc.).
    * `set-apikey <your_key>`: Set or update your Gemini API Key.
    * `set-model`: Interactively choose a different Gemini model from the available list.
    * `prompt <your prompt text>`: Set a new custom prompt for the AI analysis.
    * `prompt`: Show the current custom prompt.
    * `debug`: Toggle detailed debug logging on or off.
    * `set-trigger <combo>`: Change the global hotkey (e.g., `set-trigger ALT+SHIFT+P`). Use modifiers `CTRL`, `SHIFT`, `ALT`, `META` (Cmd on Mac, Win on Windows) followed by `+` and the key name (e.g., `A`, `B`, `1`, `F1`, `SPACE`).
    * `capture` or `c`: Manually trigger the screenshot/OCR/AI process.
    * `help`: Display the list of available commands.
    * `quit` or `exit`: Stop the application gracefully.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Compatibility

This application is designed to work on:

* **Windows**
* **macOS**

It should also work on Linux environments where Node.js, Tesseract, and the necessary libraries can be installed, although it has been primarily tested on Windows and macOS. The global hotkey listener relies on OS-specific bindings, which are handled by the `node-global-key-listener` library.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed under the ISC License. See `LICENSE` file (or check `package.json`) for more information.

*(Note: The original template used Unlicense, but your `package.json` specifies ISC. Using ISC here.)*

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

Helpful resources used or inspiration drawn from:

* [Google AI Studio](https://aistudio.google.com/)
* [Tesseract OCR Documentation](https://tesseract-ocr.github.io/)
* [Node.js Documentation](https://nodejs.org/en/docs/)
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template) (Structure)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

[Node.js]: https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white
[Node-url]: https://nodejs.org/
