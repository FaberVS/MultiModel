import { app } from "/scripts/app.js";

// Helper function to fetch style names from the backend
async function fetchStyleNames(filename) {
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
        return data.style_names || [];
    } catch (error) {
        return [];
    }
}

const ext = {
    name: "MultiModel.PromptBuilderNode.StyleUpdater",
    async setup(app) {},

    async nodeCreated(node) {
        if (node.constructor.type === "PromptBuilder") {
            const styleFileWidget = node.widgets?.find(w => w?.name === "style_file");
            const styleNameWidget = node.widgets?.find(w => w?.name === "style_name");

            if (!styleFileWidget || !styleNameWidget) {
                return;
            }

            // Встановлюємо початкові значення
            styleFileWidget.value = "None";
            styleNameWidget.value = "";
            styleNameWidget.options = { values: [] };

            // Function to update style_name options
            const updateStyleNames = async (selectedFilename) => {
                try {
                    if (!selectedFilename || selectedFilename === "None") {
                        styleNameWidget.options = { values: [] };
                        styleNameWidget.value = "";
                        node.setDirtyCanvas(true, false);
                        return;
                    }
                    
                    const names = await fetchStyleNames(selectedFilename);
                    if (!names || !names.length) {
                        styleNameWidget.options = { values: [] };
                        styleNameWidget.value = "";
                        node.setDirtyCanvas(true, false);
                        return;
                    }

                    styleNameWidget.options = { values: names };
                    styleNameWidget.value = names[0] || "";
                    node.setDirtyCanvas(true, false);
                } catch (error) {
                    styleNameWidget.options = { values: [] };
                    styleNameWidget.value = "";
                    node.setDirtyCanvas(true, false);
                }
            };

            // Set up style_file callback
            const originalCallback = styleFileWidget.callback;
            styleFileWidget.callback = async (value) => {
                await updateStyleNames(value);
                if (originalCallback) {
                    originalCallback.call(styleFileWidget, value);
                }
            };

            // Initialize style names if needed
            if (styleFileWidget.value && styleFileWidget.value !== "None") {
                setTimeout(() => updateStyleNames(styleFileWidget.value), 100);
            }
        }
    }
};

app.registerExtension(ext);

