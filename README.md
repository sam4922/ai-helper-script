<h1 align="center">
  <br>
   right-click-ai-helper
  <br>
</h1>

<h4 align="center"> Instantly analyze your screen content with <a href="http://gemini.google.com" target="_blank">Gemini AI</a> using a simple hotkey!</h4>


<p align="center">
  
  <a href="https://badge.fury.io/js/electron-markdownify">
    <img src="https://badge.fury.io/js/electron-markdownify.svg"
         alt="Gitter">
  </a>
 
</p>

<p align="center">
  <a href="#getting-started">Getting Started</a> •
  <a href="#installation">Installation</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/sam4922/ai-helper-script/refs/heads/master/ezgif-2129acc836f77b.gif" alt="screenshot">
</p>

## About The Project

**Right Click AI Helper** is a handy desktop tool that lets you quickly understand the content on your screen.

Simply press a global hotkey (default: `Ctrl+Shift+C`) or use a command in your terminal:
1.  It takes a **screenshot** of your current screen.
2.  It uses **OCR** (Optical Character Recognition) to extract any text from the screenshot using `Tesseract.js`.
3.  It sends both the **image and the extracted text** to Google's **Gemini AI** for analysis based on your custom prompt.
4.  You get the AI's response as a **desktop notification**.

It's great for quickly answering questions, explaining diagrams, or getting insights on visual content without interrupting your workflow.



### Built With

This project relies on several key Node.js libraries:

* [@google/generative-ai (0.24.0)](https://github.com/google/generative-ai-js) - For interacting with the Gemini API.
* [Tesseract.js (6.0.1)](https://github.com/naptha/tesseract.js) - For performing OCR on screenshots.
* [screenshot-desktop (1.15.1)](https://github.com/bencevans/screenshot-desktop) - For capturing the screen.
* [node-global-key-listener (0.3.0)](https://github.com/RedKenrok/node-global-key-listener) - For listening to the global hotkey.
* [node-notifier (10.0.1)](https://github.com/mikaelbr/node-notifier) - For displaying results as desktop notifications.
* [dotenv (16.5.0)](https://github.com/motdotla/dotenv) - For managing environment variables (like your API key).
* [chalk (4.1.2)](https://github.com/chalk/chalk) - For adding color to console output.

> **Note**
> Dependency versions based on your `package.json`

## Getting Started

Follow these steps to get the AI Helper running on your local machine.

### Prerequisites

You'll need a few things installed first:

1.  **Node.js and npm:**
    * We recommend using the latest **Node.js LTS (Long Term Support)** version (e.g., v18.x, v20.x, or newer LTS). Download and install it from [nodejs.org](https://nodejs.org/).
    * `npm` (Node Package Manager) is included with Node.js.
    * Verify installation by opening your terminal or command prompt and running:
      
        ```bash
        node -v
        npm -v
        ```

2. **OPTIONAL: Tesseract OCR Engine (v5.x Recommended):**
    * `Tesseract.js` (v6+) works best with **Tesseract v5.x**. While `npm install` might handle some basic setup, installing the engine separately is **highly recommended** for full language support and reliability.
    * Installation varies by OS:
        * **macOS:** Use Homebrew:
          
            ```bash
            brew install tesseract@5 # Or just 'brew install tesseract' if v5 is default
            brew install tesseract-lang # Installs all language data
            ```
        * **Windows:**
            * Download a v5.x installer from the [Tesseract at UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki) page (look for versions starting with `5.`).
            * **Important:** During installation, ensure you check the option to **add Tesseract to your system's PATH**.
            * Also, make sure to install the language data packs you need (e.g., `eng` for English).
            * *(Note: While sometimes `npm install` might seem sufficient on Windows, the separate installation ensures Tesseract is correctly found by `tesseract.js` and has the necessary language files.)*
        * **Linux (Debian/Ubuntu):** Check your package manager for Tesseract v5.x. It might be `tesseract-ocr` or a version-specific package.
          
            ```bash
            sudo apt update
            sudo apt install tesseract-ocr # Check version, install v5 if available
            sudo apt install tesseract-ocr-eng # Or other languages needed
            ```

3.  **Google Gemini API Key:**
    * You need an API key to use the Gemini AI model.
    * Get one for free from [Google AI Studio](https://aistudio.google.com/app/apikey).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Installation

> **Note**
> This installs the Node.js libraries listed in `package.json`, including `tesseract.js`

You can [download](https://github.com/sam4922/ai-helper-script/releases/tag/v1.0.0) the latest version of right-click-ai-helper for Windows and macOS.

1.  **Clone the repository:*
   
    ```bash
    git clone https://github.com/sam4922/ai-helper-script/tree/master 
    cd right-click-ai-helper 
    ```

3.  **Install NPM packages:**

    ```bash
    npm install
    ```
 

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage


1.  **Run the application:**
    Open your terminal or command prompt, navigate to the project directory, and run:
    ```sh
    node main.js
    ```
    The application will start, initialize the services, and listen for the hotkey or CLI commands.
    
    If you haven't already, **set the api key** you got from google by calling `set-apikey <key>`
    
3.  **Trigger the AI Helper:**
   
    * **Hotkey:** Press the configured global hotkey (default is `Ctrl+Shift+C`).
    * **CLI Command:** Type `capture` (or `c`) in the terminal where the script is running and press Enter.

4.  **Interact via CLI:**
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

## License

MIT

<p align="right">(<a href="#readme-top">back to top</a>)</p>


