// main.js - AI Helper with OCR, Gemini, Global Hotkey, CLI Config, Persistence, and Colors (Revised Scheme)

// --- Imports ---
const os = require('os');
const fs = require('fs').promises;
const fss = require('fs'); // Synchronous fs for specific checks like existsSync
const path = require('path');
const https = require('https'); // Built-in HTTPS module for API calls
const screenshot = require('screenshot-desktop');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const notifier = require('node-notifier');
const readline = require('readline');
const { GlobalKeyboardListener } = require('node-global-key-listener');
const chalk = require('chalk'); // Use chalk@4 for CommonJS
const dotenv = require('dotenv');

// --- Constants ---
const ENV_PATH = path.join(__dirname, '.env');
const SCREENSHOT_FILENAME = 'screenshot.png';
const TESSERACT_LANG = 'eng';
const MODELS_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS_PER_PAGE = 5; // Number of models to show per page in set-model

// Emojis for Status
const WARN_PREFIX = '>';
const ERROR_PREFIX = '>';
const SUCCESS_PREFIX = '>'; // Optional: for success

// --- State Management (with defaults) ---
let state = {
    operatingSystem: os.platform(),
    aiModel: "gemini-1.5-flash", // Default model if fetch fails or none set
    customPrompt: "Analyze the text and image from this screenshot. Provide a concise summary or answer based on the content.",
    debugMode: false,
    isRunning: true,
    isProcessing: false,
    apiKey: null,
    worker: null,
    googleAI: null,
    model: null, // Gemini model instance
    // notificationTimeout removed
    triggerKey: { name: 'C', ctrl: true, shift: true, alt: false, meta: false },
    globalListener: null,
    fetchedModels: [], // Array to store models fetched from API
    modelListPage: 0, // Current page for model selection
};

// --- Helper Functions ---

// Loggers with Revised Chalk Colors
const logTimestamp = () => chalk.gray(`[${new Date().toISOString()}]`); // Keep timestamp subtle

const logDebug = (message) => {
    if (state.debugMode) {
        // Keep debug gray
        console.log(chalk.gray(`${logTimestamp()} [DEBUG] ${message}`));
    }
};
const logInfo = (message) => {
    // Regular info is plain white
    console.log(message);
};
const logWarn = (message) => {
    // Light yellow for warnings
    console.warn(chalk.yellowBright(`${WARN_PREFIX} [WARN] ${message}`));
};
const logSuccess = (message) => {
    // Light green for success messages
    console.log(chalk.greenBright(`${SUCCESS_PREFIX} [SUCCESS] ${message}`));
};
const logError = (message, error) => {
    // Light red for errors
    const errorMessage = error instanceof Error ? error.message : (error || '');
    const errorDetails = state.debugMode && error instanceof Error ? `\n${error.stack}` : '';
    console.error(chalk.redBright.bold(`${logTimestamp()} ${ERROR_PREFIX} [ERROR] ${message} ${errorMessage}`), errorDetails);
    // Notify on error only if not processing (to avoid notification flood during capture failure)
    if (state.isRunning && !state.isProcessing) {
        notifier.notify({
            title: 'AI Helper Error',
            message: `Error: ${message}. Check console.`.substring(0, 256),
            icon: path.join(__dirname, 'icon.png'), // Ensure you have an icon.png
            sound: true,
            // timeout removed
        });
    }
};

// --- .env File Management ---

function loadEnvSettings() {
    logDebug(`Loading settings from ${ENV_PATH}`);
    try {
        if (!fss.existsSync(ENV_PATH)) {
           
            return;
        }

        const envConfig = dotenv.parse(fss.readFileSync(ENV_PATH));

        state.apiKey = envConfig.GEMINI_API_KEY || state.apiKey;
        // Let's prioritize the fetched list, but keep the .env value as the initial state.aiModel
        state.aiModel = envConfig.AI_MODEL || state.aiModel;
        state.customPrompt = envConfig.CUSTOM_PROMPT || state.customPrompt;
        state.debugMode = envConfig.DEBUG_MODE === 'true' ? true : state.debugMode;
        // notificationTimeout removed

        if (envConfig.TRIGGER_KEY) {
            try {
                const parsedKey = JSON.parse(envConfig.TRIGGER_KEY);
                if (parsedKey && typeof parsedKey.name === 'string') {
                    state.triggerKey = {
                        name: parsedKey.name,
                        ctrl: !!parsedKey.ctrl,
                        shift: !!parsedKey.shift,
                        alt: !!parsedKey.alt,
                        meta: !!parsedKey.meta,
                    };
                } else {
                    logWarn("Invalid TRIGGER_KEY format in .env file. Using default.");
                }
            } catch (e) {
                logWarn(`Error parsing TRIGGER_KEY from .env: ${e.message}. Using default.`);
            }
        }
        logInfo("Settings loaded from .env file.");

    } catch (error) {
        logError("Failed to load settings from .env file", error);
        logWarn("Using default settings.");
    }
}

async function saveEnvSettings() {
    logDebug(`Saving settings to ${ENV_PATH}`);
    const settingsToSave = {
        GEMINI_API_KEY: state.apiKey || '',
        AI_MODEL: state.aiModel, // Save the currently selected model
        CUSTOM_PROMPT: state.customPrompt,
        DEBUG_MODE: state.debugMode.toString(),
        // NOTIFICATION_TIMEOUT removed
        TRIGGER_KEY: JSON.stringify(state.triggerKey),
    };

    try {
        let existingContent = {};
        if (fss.existsSync(ENV_PATH)) {
             existingContent = dotenv.parse(await fs.readFile(ENV_PATH));
        }
        const newContent = { ...existingContent, ...settingsToSave };
        const fileContent = Object.entries(newContent)
        .map(([key, value]) => {
            // Convert value to string first to handle potential non-strings (like boolean debugMode)
            const stringValue = String(value);
            if (key === 'TRIGGER_KEY') {
                // Value is already a JSON string. Wrap it in quotes for .env, but DO NOT escape the internal quotes.
                return `${key}="${stringValue}"`;
            } else {
                // For all other keys, escape any pre-existing double quotes within the value before wrapping.
                return `${key}="${stringValue.replace(/"/g, '\\"')}"`;
            }
        })
        .join('\n');
        await fs.writeFile(ENV_PATH, fileContent);
        logSuccess("Settings saved to .env file."); // Use success log
    } catch (error) {
        logError("Failed to save settings to .env file", error);
    }
}

// --- Model Fetching ---
/**
 * Fetches available models from the Google AI API.
 * @returns {Promise<string[]>} A promise that resolves to a sorted array of model names (e.g., "gemini-1.5-pro-latest") or an empty array on failure.
 */
async function fetchAvailableModels() {
    if (!state.apiKey) {
        logWarn("Cannot fetch models: API Key not set.");
        return [];
    }
    logInfo("Fetching available AI models from Google API...");
    const url = `${MODELS_API_URL}?key=${state.apiKey}`;

    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const parsedData = JSON.parse(data);
                        if (parsedData.models && Array.isArray(parsedData.models)) {
                            const modelNames = parsedData.models
                                .map(model => model.name.startsWith('models/') ? model.name.substring(7) : model.name) // Strip "models/" prefix
                                .filter(name => name) // Ensure name is not empty
                                .sort((a, b) => {
                                    // Attempt numeric sort first based on version numbers if present
                                    const versionA = a.match(/(\d+\.?\d*)/);
                                    const versionB = b.match(/(\d+\.?\d*)/);
                                    if (versionA && versionB) {
                                        const numA = parseFloat(versionA[0]);
                                        const numB = parseFloat(versionB[0]);
                                        if (numA !== numB) return numB - numA; // Higher version first (e.g., 1.5 before 1.0)
                                    }
                                    // Fallback to alphabetical sort
                                    return a.localeCompare(b);
                                });
                            logSuccess(`Successfully fetched and sorted ${modelNames.length} models.`);
                            logDebug(`Fetched models: ${modelNames.join(', ')}`);
                            resolve(modelNames);
                        } else {
                            logError("Failed to fetch models: Invalid response format.", data);
                            resolve([]);
                        }
                    } catch (parseError) {
                        logError("Failed to parse models response from API", parseError);
                        resolve([]);
                    }
                } else {
                    logError(`Failed to fetch models: API returned status code ${res.statusCode}`, data);
                     try { // Try to parse error message from Google API
                         const errorData = JSON.parse(data);
                         if (errorData.error && errorData.error.message) {
                             logError(`API Error Message: ${errorData.error.message}`);
                         }
                     } catch (_) { /* Ignore parsing error if response isn't JSON */ }
                    resolve([]);
                }
            });
        }).on('error', (err) => {
            logError("Failed to fetch models: Network error", err);
            resolve([]);
        });
    });
}


// Convert image file to generative part format for Gemini
async function fileToGenerativePart(filePath, mimeType) {
    try {
        const data = await fs.readFile(filePath);
        return {
            inlineData: {
                data: data.toString("base64"),
                mimeType
            },
        };
    } catch (error) {
        logError(`Failed to read or encode image file: ${filePath}`, error);
        throw error;
    }
}

// --- Core Functions ---

async function initializeServices(forceReinitializeGemini = false) {
    logInfo("Initializing services..."); // Plain info
    let tesseractInitialized = false;
    let geminiInitialized = false;

    // Initialize Tesseract
    try {
        if (!state.worker) {
            logDebug(`Creating Tesseract worker for language: ${TESSERACT_LANG}...`);
            state.worker = await Tesseract.createWorker(TESSERACT_LANG);
            logInfo("Tesseract worker initialized."); // Plain info
        } else {
            logDebug("Tesseract worker already initialized.");
        }
        tesseractInitialized = true;
    } catch (error) {
        logError("Tesseract initialization failed", error);
    }

    // Initialize Gemini Client (if API key exists)
    if (state.apiKey && (!state.googleAI || forceReinitializeGemini)) {
        logDebug("Initializing Gemini client...");
        try {
            state.googleAI = new GoogleGenerativeAI(state.apiKey);
            // We'll initialize the specific model instance later in initializeGeminiModel or set-model
            logInfo(`Gemini client initialized.`);

            // Attempt to fetch models if not already fetched
            if (state.fetchedModels.length === 0) {
                state.fetchedModels = await fetchAvailableModels();
                if (state.fetchedModels.length > 0 && !state.fetchedModels.includes(state.aiModel)) {
                    logWarn(`Current model "${state.aiModel}" not found in fetched list. Defaulting to "${state.fetchedModels[0]}".`);
                    state.aiModel = state.fetchedModels[0];
                    await saveEnvSettings(); // Save the updated default model
                } else if (state.fetchedModels.length === 0) {
                     logWarn(`Could not fetch models. Using default "${state.aiModel}". You may need to set it manually.`);
                }
            }
            // Now initialize the model instance
            geminiInitialized = initializeGeminiModel();

        } catch (error) {
            logError(`Gemini client initialization failed`, error);
            logWarn("Gemini features will be unavailable until a valid API key and model are set.");
            state.googleAI = null;
            state.model = null;
            state.fetchedModels = []; // Clear models if client init fails
        }
    } else if (!state.apiKey) {
        // Warning about missing API key is handled in the main() function's intro log now
        state.googleAI = null;
        state.model = null;
        state.fetchedModels = [];
    } else if (state.googleAI && state.model && !forceReinitializeGemini) {
        logDebug("Gemini client and model already initialized.");
        geminiInitialized = true; // Already initialized
         // Ensure models are fetched if missing (e.g., if app restarted without key initially)
         if (state.fetchedModels.length === 0) {
             state.fetchedModels = await fetchAvailableModels();
         }
    } else if (state.googleAI && (!state.model || forceReinitializeGemini)) {
         // Client exists, but model needs (re)initialization
         logDebug("Gemini client exists, initializing model instance...");
         geminiInitialized = initializeGeminiModel();
    }


    return { tesseractInitialized, geminiInitialized };
}

function initializeGeminiModel() {
    if (!state.googleAI) {
        logWarn("Cannot initialize Gemini model: API client not ready (API key likely missing).");
        state.model = null;
        return false;
    }
    if (!state.aiModel) {
        logError("Cannot initialize Gemini model: No AI model selected.");
        state.model = null;
        return false;
    }

    // Ensure the selected model name includes the "models/" prefix if needed by the API client library
    // Based on @google/generative-ai docs, it seems the short name is sufficient for getGenerativeModel
    const modelNameToUse = state.aiModel; // Use the potentially stripped name

    logDebug(`Setting Gemini model instance to: ${modelNameToUse}`);
    try {
        // Check if the selected model is actually in the fetched list (if available)
        if (state.fetchedModels.length > 0 && !state.fetchedModels.includes(state.aiModel)) {
             logError(`Selected model "${state.aiModel}" is not in the list of fetched available models. Cannot initialize.`);
             logWarn(`Available models: ${state.fetchedModels.join(', ')}`);
             state.model = null;
             return false;
        }

        state.model = state.googleAI.getGenerativeModel({ model: modelNameToUse });
        // Highlight model name on success
        logInfo(`Gemini model instance set to: ${chalk.blueBright(state.aiModel)}.`);
        return true;
    } catch (error) {
        logError(`Failed to get generative model instance for ${modelNameToUse}`, error);
        logWarn(`Attempted to use model: ${modelNameToUse}. Check if this model name is valid and compatible.`);
        state.model = null;
        return false;
    }
}


async function performOCR(imagePath) {
    logDebug(`Performing OCR on ${imagePath}...`);
    if (!state.worker) {
        logError("Tesseract worker not initialized.");
        return "Error: Tesseract not ready.";
    }
    try {
        const { data: { text } } = await state.worker.recognize(imagePath);
        logDebug(`OCR Result (first 100 chars): ${text.substring(0, 100)}...`);
        return text;
    } catch (error) {
        logError("OCR process failed", error);
        return "Error during OCR.";
    }
}

async function queryGemini(ocrText, imagePath) {
    logDebug("Querying Gemini...");
    if (!state.apiKey) return `${ERROR_PREFIX} Error: Gemini API Key not set.`;
    if (!state.googleAI) return `${ERROR_PREFIX} Error: Gemini client not initialized.`;
    if (!state.model) return `${ERROR_PREFIX} Error: Gemini model (${state.aiModel}) not initialized.`;

    const generationConfig = { temperature: 0.4, topK: 32, topP: 1, maxOutputTokens: 4096 };
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    try {
        logDebug("Preparing image data for Gemini...");
        const imagePart = await fileToGenerativePart(imagePath, "image/png");
        const promptParts = [
            { text: state.customPrompt },
            { text: "\n--- OCR Text ---" },
            { text: ocrText || "(No text detected by OCR)" },
            { text: "\n--- Image ---" },
            imagePart,
        ];

        logDebug(`Sending request to Gemini model (${state.aiModel})...`);
        const result = await state.model.generateContent({
            contents: [{ role: "user", parts: promptParts }],
            generationConfig, safetySettings,
        });

        const response = result?.response;
        const candidates = response?.candidates;

        if (!response || !candidates || candidates.length === 0 || !candidates[0].content || !candidates[0].content.parts || candidates[0].content.parts.length === 0) {
            const blockReason = response?.promptFeedback?.blockReason;
            const safetyRatings = response?.promptFeedback?.safetyRatings;
            const finishReason = candidates?.[0]?.finishReason;
            const errorMsg = `Gemini response blocked, empty, or incomplete. Reason: ${blockReason || finishReason || 'Unknown'}.`;
            logError(errorMsg, `Ratings: ${JSON.stringify(safetyRatings)} Response: ${JSON.stringify(response, null, 2)}`);
            return `${ERROR_PREFIX} Error: ${errorMsg}`;
        }

        const responseText = candidates[0].content.parts.map(part => part.text).filter(text => typeof text === 'string').join('');
         if (!responseText) {
             logError("Gemini response received but processed text content is missing or empty.");
             return `${ERROR_PREFIX} Error: Gemini response missing text content.`;
         }

        logDebug(`Gemini Response (first 100 chars): ${responseText.substring(0, 100)}...`);
        return responseText;

    } catch (error) {
        logError("Gemini API call failed", error);
        // Check if the error is from the API (e.g., invalid model name)
        if (error.message && error.message.includes('not found') || error.message.includes('permission')) {
             logError(`Potential issue with model "${state.aiModel}". Try selecting a different model.`, error);
             return `${ERROR_PREFIX} Error with model ${state.aiModel}: ${error.message}`;
        }
        return `${ERROR_PREFIX} Error communicating with Gemini: ${error.message || "Unknown Gemini Error"}`;
    }
}

async function handleCapture(triggerSource = "unknown") {
    if (state.isProcessing) {
        // Use warning for already processing
        logWarn(`Already processing. Ignoring trigger from ${triggerSource}.`);
        if(state.isRunning && triggerSource === 'command' && rl) rl.prompt();
        return;
    }

    // Check prerequisites
    if (!state.apiKey || !state.googleAI || !state.model) {
         logError("Cannot capture: Gemini API Key or Model not configured/initialized.");
         logWarn("Use 'set-apikey' and 'set-model' commands first.");
         if(state.isRunning && triggerSource === 'command' && rl) rl.prompt();
         return;
    }
     if (!state.worker) {
         logError("Cannot capture: Tesseract worker not initialized.");
         if(state.isRunning && triggerSource === 'command' && rl) rl.prompt();
         return;
     }

    state.isProcessing = true;

    // --- Capture Process Group ---
    console.log("\n"); // Add newline before the group
    console.group(chalk.bold(`--- Capture Triggered (Source: ${chalk.blueBright(triggerSource)}) ---`));

    const screenshotPath = path.join(__dirname, SCREENSHOT_FILENAME);

    try {
        // 1. Take Screenshot
        logDebug("Taking screenshot...");
        const displays = await screenshot.listDisplays();
        if (!displays || displays.length === 0) throw new Error("No displays found.");
        await screenshot({ filename: screenshotPath, screen: displays[0].id });
        logDebug(`Screenshot saved to ${screenshotPath}`);

        // 2. Perform OCR
        logDebug("Starting OCR...");
        const ocrText = await performOCR(screenshotPath);
        if (ocrText.startsWith("Error:")) {
            logError(`OCR step failed: ${ocrText.substring(7)}`, null); // Remove "Error: " prefix
        } else {
            logDebug("OCR finished.");
        }

        // 3. Query Gemini
        logDebug("Starting Gemini query...");
        const geminiResponse = await queryGemini(ocrText, screenshotPath);
         if (geminiResponse.startsWith(ERROR_PREFIX)) { // Check for our error prefix
             throw new Error(geminiResponse.substring(ERROR_PREFIX.length + 1)); // Throw the specific Gemini error message
         }
        logDebug("Gemini query finished.");

        // 4. Show Notification
        logInfo("Displaying notification...");
        notifier.notify({
            title: 'AI Helper Result',
            message: geminiResponse.substring(0, 256), // Limit message length for notifications
            icon: path.join(__dirname, 'icon.png'),
            sound: true,
            wait: false, // Don't wait for user interaction
            // timeout removed
        });
        logInfo(geminiResponse); // Log the full response to console
        logSuccess("Capture process completed successfully."); // Use success log

    } catch (error) {
        // Log the specific error that occurred during the process
        logError(`Capture process failed: ${error.message}`, state.debugMode ? error.stack : ''); // Show stack only in debug

    } finally {
        // Cleanup screenshot file
        try {
            await fs.access(screenshotPath); // Check if file exists before unlinking
            await fs.unlink(screenshotPath);
            logDebug("Screenshot file deleted.");
        } catch (unlinkError) {
            // Only log if it's not a "file not found" error
            if (unlinkError.code !== 'ENOENT') {
                 logWarn(`Could not delete screenshot file: ${unlinkError.message}`);
            } else {
                 logDebug("Screenshot file not found for deletion (may have failed earlier).");
            }
        }
        state.isProcessing = false;
        logDebug("Processing lock released.");

        console.groupEnd(); // End the capture process group
        console.log(""); // Add newline after the group

        if(state.isRunning && triggerSource === 'command' && rl) {
             rl.prompt(); // Re-enable prompt only if triggered by command
        }
    }
}

// --- Global Input Listener Setup ---
function setupGlobalListener() {
    if (state.globalListener) {
        logWarn("Attempting to set up global listener again. Killing existing one.");
        try {
            state.globalListener.kill();
        } catch (killError) {
            logError("Error killing previous listener instance", killError);
        }
        state.globalListener = null;
    }

    try {
        // Highlight the key combination
        logInfo(`Setting up global key listener for: ${chalk.blueBright(formatTriggerKey(state.triggerKey))}`);
        state.globalListener = new GlobalKeyboardListener();

        state.globalListener.addListener((event, down) => {
            // Ignore key up events and events while processing or not running
            if (event.state !== "DOWN" || !state.isRunning || state.isProcessing) {
                return;
            }

            // Check if the pressed key combination matches the triggerKey
            const keyNameMatch = event.name === state.triggerKey.name;
            // Handle Ctrl/Cmd mapping for Mac
            const ctrlOrMeta = down['LEFT CTRL'] || down['RIGHT CTRL'] || (state.operatingSystem === 'darwin' && (down['LEFT META'] || down['RIGHT META']));
            const ctrlMatch = state.triggerKey.ctrl ? ctrlOrMeta : !ctrlOrMeta;
            const shiftMatch = state.triggerKey.shift ? (down['LEFT SHIFT'] || down['RIGHT SHIFT']) : !(down['LEFT SHIFT'] || down['RIGHT SHIFT']);
            const altMatch = state.triggerKey.alt ? (down['LEFT ALT'] || down['RIGHT ALT']) : !(down['LEFT ALT'] || down['RIGHT ALT']);
            // Explicitly check meta key state (usually Command on Mac, Windows key on Win)
            const metaPressed = down['LEFT META'] || down['RIGHT META'];
            const metaMatch = state.triggerKey.meta ? metaPressed : !metaPressed;

            // Debugging key presses
            // logDebug(`Key Event: ${event.name}, State: ${event.state}, Down: ${JSON.stringify(down)}`);
            // logDebug(`Matches: Key=${keyNameMatch}, Ctrl=${ctrlMatch}, Shift=${shiftMatch}, Alt=${altMatch}, Meta=${metaMatch}`);


            if (keyNameMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
                logDebug(`Hotkey ${chalk.blueBright(formatTriggerKey(state.triggerKey))} detected.`);
                // Use setImmediate to avoid potential issues within the listener callback
                setImmediate(() => handleCapture('hotkey'));
            }
        });

        logSuccess("Global key listener active."); // Use success log

    } catch (error) {
        logError("Failed to initialize global key listener. Hotkey trigger will not work.", error);
        logWarn("Falling back to CLI 'capture' command only.");
        state.globalListener = null;
    }
}

// Helper to format the trigger key object into a readable string
function formatTriggerKey(keyConfig) {
    let parts = [];
    if (keyConfig.ctrl) parts.push("CTRL");
    if (keyConfig.shift) parts.push("SHIFT");
    if (keyConfig.alt) parts.push("ALT");
    if (keyConfig.meta) parts.push("META");
    // Bold the key name part
    parts.push(chalk.bold(keyConfig.name || '<?>'));
    return parts.join('+');
}

// Helper to parse a string like "CTRL+SHIFT+K" into a trigger key object
function parseTriggerKey(keyString) {
    if (!keyString || typeof keyString !== 'string') return null;

    const parts = keyString.toUpperCase().split('+').map(p => p.trim()).filter(p => p);
    if (parts.length === 0) return null;

    const newTrigger = { name: null, ctrl: false, shift: false, alt: false, meta: false };
    const keyNamePart = parts[parts.length - 1];

    // Basic validation for key name (allow common special keys)
    const allowedSpecialKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'SPACE', 'ENTER', 'TAB', 'ESCAPE', 'DELETE', 'BACKSPACE', 'UP ARROW', 'DOWN ARROW', 'LEFT ARROW', 'RIGHT ARROW', 'PAGE UP', 'PAGE DOWN', 'HOME', 'END', 'INSERT'];
    if (keyNamePart.length > 1 && !/^[A-Z0-9]$/.test(keyNamePart) && !allowedSpecialKeys.includes(keyNamePart)) {
         logWarn(`Possibly invalid key name detected: "${keyNamePart}". Ensure it's a single letter/number or a known special key (e.g., F1, SPACE, ENTER).`);
    }
     if (keyNamePart.length === 1 && !/^[A-Z0-9]$/.test(keyNamePart)) {
         logWarn(`Possibly invalid single character key name detected: "${keyNamePart}". Use A-Z or 0-9.`);
     }

    newTrigger.name = keyNamePart; // Store the key name as parsed

    for (let i = 0; i < parts.length - 1; i++) {
        switch (parts[i]) {
            case 'CTRL': case 'CONTROL': newTrigger.ctrl = true; break;
            case 'SHIFT': newTrigger.shift = true; break;
            case 'ALT': newTrigger.alt = true; break;
            case 'META': case 'CMD': case 'COMMAND': case 'WIN': case 'WINDOWS': newTrigger.meta = true; break;
            default: logWarn(`Unrecognized modifier: "${parts[i]}". Ignoring.`);
        }
    }

    if (!newTrigger.name) {
        logError("Invalid trigger key string: No key name found.");
        return null;
    }
    return newTrigger;
}


// --- Command Line Interface (CLI) ---

// Define the prompt string (plain white, bold)
const cliPrompt = chalk.white.bold('AI Helper> ');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: cliPrompt // Use the defined prompt string
});

// Wrapper for rl.question that returns a Promise
function askQuestion(query) {
    // Use light yellow for questions
    return new Promise(resolve => rl.question(chalk.yellowBright(query), resolve));
}

// --- CLI Command Handler ---
rl.on('line', async (line) => {
    // Ignore input if not running (except for quit/exit) or if processing a capture
    if ((!state.isRunning && !['quit', 'exit'].includes(line.trim().toLowerCase())) || state.isProcessing) {
        // If processing, maybe give a small message?
        if (state.isProcessing) {
            // Temporarily pause readline input during processing? Might be complex.
            // For now, just ignore the input line.
            logDebug("Ignoring CLI input while processing.");
        }
        return;
    }


    const args = line.trim().split(' ');
    const command = args[0].toLowerCase();
    const value = args.slice(1).join(' ');
    let needsReprompt = true; // Assume we need to re-prompt unless command handles it

    switch (command) {
        case 'init': // Alias for get
        case 'get':
            console.log("\n"); // Add newline before the group
            console.group(chalk.bold("--- Current Configuration ---")); // Use bold for title
            console.log(`Operating System: ${chalk.blueBright(state.operatingSystem)}`);
            // Use colors for status indication only
            const apiKeyStatus = state.apiKey ? chalk.greenBright('Set') : chalk.yellowBright('Not Set');
            console.log(`API Key Status: ${apiKeyStatus}`);
            const modelStatus = (!state.apiKey || !state.googleAI || !state.model) ? chalk.yellowBright('(Inactive/Not Initialized)') : chalk.greenBright('(Active)');
            console.log(`AI Model: ${chalk.blueBright(state.aiModel)} ${modelStatus}`);
            const fetchedModelCount = state.fetchedModels.length > 0 ? `(${state.fetchedModels.length} fetched)` : '(Not fetched/failed)';
            console.log(`Available Models: ${chalk.blueBright(fetchedModelCount)}`);
            const debugStatus = state.debugMode ? chalk.greenBright('Enabled') : chalk.white('Disabled'); // White for disabled
            console.log(`Debug Mode: ${debugStatus}`);
            // Notification timeout removed
            const listenerStatus = state.globalListener ? chalk.greenBright('Active') : chalk.redBright('Inactive/Failed');
            // Highlight the hotkey itself
            console.log(`Trigger Hotkey: ${chalk.blueBright(formatTriggerKey(state.triggerKey))} (${listenerStatus})`);
            // Italicize the prompt value
            console.log(`Custom Prompt: "${chalk.italic(state.customPrompt)}"`);
            console.groupEnd();
            console.log(""); // Add newline after the group
            break;

        case 'set-apikey':
            if (value) {
                state.apiKey = value;
                logInfo("API Key updated.");
                await saveEnvSettings();
                logInfo("Attempting to re-initialize Gemini services with new key...");
                // Re-initialize, which will also attempt to fetch models
                await initializeServices(true);
            } else {
                logInfo("Usage: set-apikey <your_gemini_api_key>");
                logWarn("Get your key from Google AI Studio. To paste, right click or paste into the command prompt");
            }
            break;

        case 'set-model':
            if (!state.apiKey || !state.googleAI) {
                logError("Cannot set model: API Key not set or Gemini client not initialized.");
                logWarn("Use 'set-apikey' first. To paste, right click or paste into the command prompt");
                break;
            }

            // Try fetching models if they haven't been fetched yet
            if (state.fetchedModels.length === 0) {
                logInfo("Models not fetched yet, attempting to fetch now...");
                state.fetchedModels = await fetchAvailableModels();
            }

            if (state.fetchedModels.length === 0) {
                logError("Failed to fetch or no models available from the API.");
                logWarn("Cannot select a model. Check API key and network connection.");
                break;
            }

            // --- Pagination Logic (Corrected Numbering) ---
            let selectionMade = false;
            state.modelListPage = 0; // Reset to first page on command start

            while (!selectionMade && state.isRunning) { // Loop until a model is selected or cancelled
                const totalModels = state.fetchedModels.length;
                const startIndex = state.modelListPage * MODELS_PER_PAGE;
                const endIndex = Math.min(startIndex + MODELS_PER_PAGE, totalModels);
                const modelsToShow = state.fetchedModels.slice(startIndex, endIndex);
                const numModelsOnPage = modelsToShow.length; // Number of models actually displayed

                console.log("\n"); // Add newline before the group
                console.group(chalk.bold(`--- Select AI Model (Page ${state.modelListPage + 1}/${Math.ceil(totalModels / MODELS_PER_PAGE)}) ---`));
                modelsToShow.forEach((model, index) => {
                    const displayIndex = index + 1; // Model numbers start from 1
                    const currentMarker = model === state.aiModel ? chalk.greenBright('(Current)') : '';
                    console.log(`  ${chalk.blueBright(displayIndex)}: ${chalk.blueBright(model)} ${currentMarker}`);
                });

                // Option numbering starts *after* the last model number on the page
                let currentOptionNumber = numModelsOnPage + 1;
                const showMoreOptionNumber = endIndex < totalModels ? currentOptionNumber++ : null;
                const goPreviousOptionNumber = state.modelListPage > 0 ? currentOptionNumber++ : null;
                const cancelOptionNumber = 0; // Keep cancel as 0

                console.log(chalk.bold("-".repeat(52))); // Separator line
                if (showMoreOptionNumber) console.log(`  ${chalk.blueBright(showMoreOptionNumber)}: Show More`);
                if (goPreviousOptionNumber) console.log(`  ${chalk.blueBright(goPreviousOptionNumber)}: Go Previous`);
                console.log(`  ${chalk.blueBright(cancelOptionNumber)}: Cancel`);
                console.groupEnd(); // End the model selection group for this page
                console.log(""); // Add newline after the group

                const choiceStr = await askQuestion("Enter the number of the model or option: ");
                const choice = parseInt(choiceStr, 10);

                if (isNaN(choice)) {
                    logError("Invalid input. Please enter a number.");
                    continue; // Ask again on the same page
                }

                // --- Input Handling (Corrected) ---
                if (choice === cancelOptionNumber) {
                    logInfo("Model selection cancelled.");
                    selectionMade = true;
                } else if (showMoreOptionNumber && choice === showMoreOptionNumber) {
                    state.modelListPage++;
                    logDebug("Showing next page of models.");
                } else if (goPreviousOptionNumber && choice === goPreviousOptionNumber) {
                    state.modelListPage--;
                    logDebug("Showing previous page of models.");
                } else if (choice > 0 && choice <= numModelsOnPage) { // Check against number of models *on this page*
                    const selectedModel = modelsToShow[choice - 1]; // Get model based on 1-based index
                    if (selectedModel !== state.aiModel) {
                        state.aiModel = selectedModel;
                        logInfo(`AI Model changing to: ${chalk.blueBright(state.aiModel)}`);
                        if (initializeGeminiModel()) {
                            await saveEnvSettings();
                            selectionMade = true; // Exit loop on successful selection
                        } else {
                             logError(`Failed to initialize model ${state.aiModel}. Selection failed. Check logs.`);
                             // Optionally revert state.aiModel or keep loop going
                             // For simplicity, we'll let the user try again or cancel
                        }
                    } else {
                        logInfo("Selected model is already the current model.");
                        selectionMade = true; // Exit loop as no change needed
                    }
                } else {
                    logError("Invalid choice number."); // Choice didn't match any model or option
                }
                 // Add a small delay if looping to prevent overly fast prompts on error/page change
                 if (!selectionMade) await new Promise(resolve => setTimeout(resolve, 50));
            } // End while loop

            needsReprompt = false; // Prompting was handled inside the loop
            rl.prompt(); // Re-prompt after the selection process finishes
            break;
            // --- End Pagination Logic ---


        case 'prompt':
            if (value) {
                state.customPrompt = value;
                logInfo(`Prompt updated.`);
                await saveEnvSettings();
            } else {
                // Italicize current prompt when showing
                logInfo(`Current Prompt: "${chalk.italic(state.customPrompt)}"`);
                logInfo("Usage: prompt <your new prompt text>");
            }
            break;
        case 'debug':
            state.debugMode = !state.debugMode;
            // Use green/white for status
            const debugToggleStatus = state.debugMode ? chalk.greenBright('enabled') : chalk.white('disabled');
            logInfo(`Debug mode ${debugToggleStatus}.`);
            await saveEnvSettings();
            break;
        // case 'notify-duration': removed
        case 'set-trigger':
            if (value) {
                const newTrigger = parseTriggerKey(value);
                if (newTrigger) {
                    state.triggerKey = newTrigger;
                    // Highlight new key
                    logInfo(`Trigger key set to: ${chalk.blueBright(formatTriggerKey(state.triggerKey))}`);
                    setupGlobalListener(); // Re-setup listener with the new key
                    if (!state.globalListener) {
                         logError("Failed to restart listener with the new key. Hotkey might not work.");
                    }
                    await saveEnvSettings();
                } else {
                    logError(`Invalid trigger format: "${value}". Example: CTRL+SHIFT+K`);
                }
            } else {
                logInfo(`Current trigger key: ${chalk.blueBright(formatTriggerKey(state.triggerKey))}`);
                logInfo("Usage: set-trigger <key_combination> (e.g., set-trigger CTRL+SHIFT+X)");
                logInfo("Modifiers: CTRL, SHIFT, ALT, META. Key: A-Z, 0-9, F1-F12, SPACE, etc.");
            }
            break;
        case 'capture':
        case 'c':
            needsReprompt = false; // handleCapture will re-prompt if needed
            await handleCapture('command');
            break;
        case 'quit':
        case 'exit':
            logInfo("Exit command received. Shutting down...");
            needsReprompt = false;
            await shutdown('command');
            return; // Exit the handler immediately
        case 'help':
             console.log("\n"); // Add newline before the group
             console.group(chalk.bold("--- Available Commands ---"));
             console.log(`  ${chalk.blueBright('get / init')}        - Show current configuration.`);
             console.log(`  ${chalk.blueBright('set-apikey <key>')}  - Set your Gemini API Key.`);
             console.log(`  ${chalk.blueBright('set-model')}          - Choose the Gemini AI model (fetches list, paginated).`);
             console.log(`  ${chalk.blueBright('prompt <text>')}      - Set a new custom prompt for Gemini.`);
             console.log(`  ${chalk.blueBright('prompt')}             - Show the current prompt.`);
             console.log(`  ${chalk.blueBright('debug')}              - Toggle debug logging.`);
             // notify-duration removed
             console.log(`  ${chalk.blueBright('set-trigger <combo>')} - Set the global hotkey (e.g., CTRL+SHIFT+C).`);
             console.log(`  ${chalk.blueBright('capture / c')}        - Manually trigger screenshot, OCR, and AI analysis.`);
             console.log(`  ${chalk.blueBright('quit / exit')}        - Stop the application.`);
             console.log(`  ${chalk.blueBright('help')}               - Show this help message.`);
             console.groupEnd();
             console.log(""); // Add newline after the group
             break;
        default:
            if (command) {
                // Use warning for unknown commands
                logWarn(`Unknown command: "${command}". Type 'help' for available commands.`);
            }
            // If just enter was pressed (empty command), don't show unknown command
            break;
    }

    // Re-prompt if the command didn't handle it and we're still running and not processing
    if (needsReprompt && state.isRunning && !state.isProcessing) {
        rl.prompt();
    }
});

// Handle readline close event
rl.on('close', () => {
    logInfo('Readline interface closed.');
    if (state.isRunning) {
        logWarn("Readline closed unexpectedly. Initiating shutdown...");
        // Ensure shutdown is called, even if rl.close() was called during shutdown
        shutdown('readline_close');
    } else {
        logDebug("Readline closed as part of normal shutdown.");
    }
});


// --- Main Execution ---
async function main() {
  
    loadEnvSettings();

    
  
    console.log(""); // Add newline after init group
    console.group(chalk.bold("--- IMPORTANT ---"));
    logInfo(`This application uses Google's Gemini AI for analysis.`);
    
    logInfo(`Type ${chalk.blueBright('help')} for a list of available commands.`);
    console.groupEnd();
    console.log(""); // Add newline after init group
    console.group(chalk.bold("--- Initialization ---"));

    if (!state.apiKey) {
        
    } else {
        logSuccess("Gemini API Key found in settings.");
    }
    // Highlight OS
    logInfo(`Detected OS: ${chalk.blueBright(state.operatingSystem)}`);
    // Initialize services (this will now also try to fetch models if API key exists)
    const { tesseractInitialized, geminiInitialized } = await initializeServices();

    if (!tesseractInitialized) {
        logError("Tesseract failed to initialize. OCR features will be unavailable.");
    }
     // Gemini initialization status is now handled within initializeServices logs

    setupGlobalListener();

    // Use success log for ready message
    logSuccess("Initialization complete. Ready.");
    // Add reminders if necessary components failed or are missing
    if (state.apiKey && !state.model) {
        logWarn(`Reminder: Gemini model "${state.aiModel}" failed to initialize or is not set. Use 'set-model' to choose a valid one.`);
    }
    // Highlight hotkey and status
    const listenerReadyStatus = state.globalListener ? chalk.greenBright('enabled') : chalk.redBright('(FAILED)');
    console.groupEnd();
    console.log("--- Initialization Finished ---"); // Add newline after init group
    console.log(""); // Add newline after init group
    
    if (!state.apiKey) {
        logWarn("Gemini API Key is NOT configured.");
        logWarn("You need an API key from Google AI Studio (https://aistudio.google.com/app/apikey).");
        logWarn(`Once you have a key, use the command: ${chalk.blueBright('set-apikey YOUR_API_KEY')}`);
        logWarn("AI features will be disabled until a key is set.");
        logWarn("To paste in, right click or paste into the command prompt");
       
    } else {
        logInfo(`To take a capture: press the configured hotkey`);
        logInfo(`Hotkey: ${chalk.blueBright(formatTriggerKey(state.triggerKey))} ${listenerReadyStatus}.`);
    }

   
   

    rl.prompt(); // Start the CLI prompt
}

// --- Graceful Shutdown ---
const shutdown = async (signal) => {
    if (!state.isRunning) {
        logDebug(`Shutdown already in progress or completed. Signal (${signal}) ignored.`);
        return;
    }
    // Use warning color for shutdown signal
    console.log("\n"); // Add newline before shutdown message
    logInfo(chalk.bold(`Shutdown initiated by ${chalk.yellowBright(signal)}. Cleaning up...`));
    state.isRunning = false; // Prevent further operations

    // Stop listener first to prevent new triggers
    if (state.globalListener) {
        logDebug("Stopping global key listener...");
        try {
            state.globalListener.kill();
            logInfo("Global key listener stopped.");
        } catch (error) {
            logError("Error stopping global key listener during shutdown", error);
        }
        state.globalListener = null;
    } else {
        logDebug("No active global listener to stop.");
    }

    // Close readline interface
    if (rl && !rl.closed) {
        logDebug("Closing readline interface...");
        rl.close(); // This will trigger the 'close' event handler
    } else {
         logDebug("Readline interface already closed or not initialized.");
    }

    // Terminate Tesseract worker
    if (state.worker && typeof state.worker.terminate === 'function') {
        logDebug("Terminating Tesseract worker...");
        try {
            await state.worker.terminate();
            logInfo("Tesseract worker terminated.");
        } catch (err) {
            logError("Error during Tesseract worker termination", err);
        }
        state.worker = null;
    } else {
        logDebug("No active Tesseract worker to terminate.");
    }

    // Final exit message - bold
    console.log(chalk.bold("--- Shutdown complete. Exiting. ---"));
    // Allow a very brief moment for logs to flush before exiting
    setTimeout(() => process.exit(0), 100);
};

// --- Signal and Error Handlers ---
// Ensure shutdown is called only once
let shuttingDown = false;
const handleExitSignal = (signal) => {
    if (!shuttingDown && state.isRunning) {
        shuttingDown = true;
        shutdown(signal).catch(err => {
            console.error(chalk.redBright.bold(`${ERROR_PREFIX} Error during shutdown: ${err.message}`));
            process.exit(1); // Exit with error if shutdown fails
        });
    } else if (!state.isRunning) {
         logDebug(`Received signal ${signal} but already shutting down or stopped.`);
    }
};

process.on('SIGINT', () => handleExitSignal('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => handleExitSignal('SIGTERM')); // Termination signal

process.on('uncaughtException', (error, origin) => {
    // Use logError for consistent formatting
    logError(`FATAL: Uncaught Exception at: ${origin}`, error);
    if (!shuttingDown && state.isRunning) {
        shuttingDown = true;
        // Attempt graceful shutdown but exit quickly after
        shutdown('uncaughtException').catch(() => {}).finally(() => {
            console.error(chalk.redBright.bold(`${ERROR_PREFIX} Exiting due to uncaught exception.`));
            process.exit(1);
        });
    } else {
        // If already shutting down or stopped, just log and exit
        console.error(chalk.redBright.bold(`${ERROR_PREFIX} Exiting immediately due to uncaught exception during/after shutdown.`));
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logError('FATAL: Unhandled Rejection at:', promise);
    logError('Reason:', reason instanceof Error ? reason.message : reason); // Log the reason's message if it's an Error
     if (state.debugMode && reason instanceof Error) {
         console.error(reason.stack); // Log stack in debug mode
     }
    if (!shuttingDown && state.isRunning) {
        shuttingDown = true;
        shutdown('unhandledRejection').catch(() => {}).finally(() => {
            console.error(chalk.redBright.bold(`${ERROR_PREFIX} Exiting due to unhandled rejection.`));
            process.exit(1);
        });
    } else {
        console.error(chalk.redBright.bold(`${ERROR_PREFIX} Exiting immediately due to unhandled rejection during/after shutdown.`));
        process.exit(1);
    }
});

// --- Run ---
main().catch(error => {
    // Catch critical errors during initial startup (before error handlers are fully reliable)
    console.error(chalk.redBright.bold(`${ERROR_PREFIX} [CRITICAL STARTUP ERROR] ${error.message}`));
    if (state.debugMode) {
        console.error(error.stack);
    }
    process.exit(1); // Exit immediately on critical startup failure
});
