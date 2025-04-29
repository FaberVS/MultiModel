import { app } from "/scripts/app.js";

// Simple test log to confirm the file is loaded
// console.log("SIMPLE TEST: js/ModelParamsNode.js executed!"); 

console.log("%c[ModelParamsNode] JS файл завантажився! (v2-dynamic-inputs)", "color: white; background: #007acc; font-weight: bold; padding: 2px 8px; border-radius: 3px;");
// --- Loading js/ModelParamsNode.js --- v2-dynamic-inputs

// Helper function to fetch style names from the backend
async function fetchStyleNames(filename) {
    // Return empty array immediately if filename is 'None' or invalid
    if (!filename || filename === "None") {
        return [];
    }
    try {
        const response = await fetch('/multi_model/get_style_names', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filename: filename })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
        }
        const data = await response.json();
        // console.log("Received style names:", data); // Keep commented
        return data.style_names || []; // Return empty array on failure or no names
    } catch (error) {
        console.error(`[MultiModel Extension] Error fetching style names for ${filename}:`, error);
        return []; // Return empty array on error
    }
}

const ext = {
    name: "MultiModel.PromptBuilderNode.StyleUpdater",
    async setup(app) {
        // console.log("MultiModel.PromptBuilderNode.StyleUpdater extension setup called");
    },

    async nodeCreated(node) {
        // console.log(`MultiModel Extension: nodeCreated called for node: ${node.getTitle()} (Type: ${node.constructor.type})`);
        
        // Check if this is the target node type we want to modify
        if (node.constructor.type === "PromptBuilder") {
            // console.log(`MultiModel Extension: Found target node type 'PromptBuilderNode': ${node.getTitle()}`);
            
            const styleFileWidget = node.widgets.find(w => w.name === "style_file");
            const styleNameWidget = node.widgets.find(w => w.name === "style_name");

            if (!styleFileWidget) {
                console.error("[MultiModel Extension] Could not find 'style_file' widget on PromptBuilderNode!");
                return;
            }
            if (!styleNameWidget) {
                console.error("[MultiModel Extension] Could not find 'style_name' widget on PromptBuilderNode!");
                return;
            }

            // Force the widget type to combo, even if Python defined it as STRING
            styleNameWidget.type = "combo";
            // Ensure options object exists for combo box properties
            if (!styleNameWidget.options) { styleNameWidget.options = {}; }

            // Add a callback to handle selection changes for the style_name widget itself
            styleNameWidget.callback = (value) => {
                 // Explicitly set the widget's value on selection
                 styleNameWidget.value = value;
                 console.log(`[MultiModel Extension] style_name selected and value set to: ${styleNameWidget.value}`);
                 // Optional: Force redraw if the value change doesn't update visually
                 // node.setDirtyCanvas(true, false);
            };

            // console.log("MultiModel Extension: Found 'style_file' and 'style_name' widgets.");

            // Function to update style_name options
            const updateStyleNames = async (selectedFilename) => {
                const names = await fetchStyleNames(selectedFilename);
                if (styleNameWidget.options) {
                    // console.log(`[MultiModel Extension] Updating styleNameWidget.options.values to:`, names);
                    styleNameWidget.options.values = names;

                    // Встановлюємо значення: або поточне (якщо воно є в новому списку), або перший елемент нового списку
                    // console.log(`[MultiModel Extension] Before setting value - current styleNameWidget.value: ${styleNameWidget.value}, styleNames includes current value: ${names.includes(styleNameWidget.value)}`);
                    styleNameWidget.value = names.includes(styleNameWidget.value) ? styleNameWidget.value : names[0];
                    // console.log(`[MultiModel Extension] After setting value - new styleNameWidget.value: ${styleNameWidget.value}`);

                    // Додаємо колбек, якщо його ще немає
                    if (!styleNameWidget.callback) {
                        styleNameWidget.callback = (value) => {
                            styleNameWidget.value = value;
                            console.log(`[MultiModel Extension] style_name selected and value set to: ${styleNameWidget.value}`);
                        };
                    }
                } else {
                    console.error("[MultiModel Extension] 'style_name' widget does not have accessible options.");
                }
            };

            const originalCallback = styleFileWidget.callback;

            styleFileWidget.callback = async (value) => {
                // console.log(`MultiModel Extension: style_file changed to: ${value}`);
                await updateStyleNames(value);
                if (originalCallback) {
                    originalCallback.call(styleFileWidget, value);
                }
            };

            if (styleFileWidget.value) {
                 // console.log(`MultiModel Extension: Initializing style_names for file: ${styleFileWidget.value}`);
                 setTimeout(() => updateStyleNames(styleFileWidget.value), 100); // Keep timeout for initialization
            } else {
                 console.warn("[MultiModel Extension] 'style_file' widget has no initial value on creation.");
            }
        }
    }
};

app.registerExtension(ext);

