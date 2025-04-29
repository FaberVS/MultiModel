import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";

// Simple debounce function
function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

// Use the class name registered in NODE_CLASS_MAPPINGS
const nodeClassName = "MySwitchIndex"; 

app.registerExtension({
  name: "MultiModel.MySwitchIndex", 
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    // Compare with the class name
    if (nodeData.name === nodeClassName) { 
      console.log(`[MultiModel] Patching ${nodeClassName}`);

      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function() {
        onNodeCreated?.apply(this, arguments);
        console.log(`[MultiModel] ${nodeClassName} created`);

        // Find widgets (should exist based on Python definition)
        const modeWidget = this.widgets.find(w => w.name === "mode");
        const indexWidget = this.widgets.find(w => w.name === "index");

        if (!modeWidget) {
            console.error(`[MultiModel] ${nodeClassName}: 'mode' widget not found! Cannot apply dynamic visibility.`);
            return;
        }
        if (!indexWidget) {
            console.error(`[MultiModel] ${nodeClassName}: 'index' widget not found! Cannot apply dynamic visibility.`);
             return;
        }
        
        // Function to update index widget visibility
        const updateVisibility = (modeValue) => {
            if (indexWidget) {
                 const shouldBeHidden = (modeValue !== "index"); // Поле повинно бути приховане, якщо режим НЕ "index"
                 // Завжди встановлюємо правильний стан `hidden`
                 indexWidget.hidden = shouldBeHidden;
                 console.log(`[MultiModel] ${nodeClassName}: Setting index widget hidden to: ${indexWidget.hidden} (mode is ${modeValue})`);
                 // Запитуємо перемалювання, щоб зміни відобразились
                 app.graph.setDirtyCanvas(true, false); 
                 // Можливо, знадобиться примусове оновлення розміру, якщо ComfyUI не робить це автоматично при зміні hidden
                 // this.computeSize(); 
            }
        };

        // Store original callback and wrap it
        const originalModeCallback = modeWidget.callback;
        modeWidget.callback = (value) => {
            console.log(`[MultiModel] ${nodeClassName}: Mode widget callback triggered with value: ${value}`);
            // Викликаємо оригінальний callback, якщо він існує
            originalModeCallback?.apply(modeWidget, [value]); 
            updateVisibility(value);
        };

        // Set initial visibility based on the current mode value
        // Викликаємо відразу після ініціалізації віджетів
        console.log(`[MultiModel] ${nodeClassName}: Setting initial visibility for mode: ${modeWidget.value}`);
        updateVisibility(modeWidget.value);
        
        // --- Keep dynamic input logic ---
        // We might want this active even in 'index' mode if the user wants 
        // to visually see which inputs are available, though they aren't used
        // for selection in that mode. 
        this.updateInputs(); // Initial call to potentially add the first input
      };

      // --- Dynamic input logic (kept mostly as is) ---
      const onConnectionsChange = nodeType.prototype.onConnectionsChange;
      nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info, slot) {
        onConnectionsChange?.apply(this, arguments);
        this.scheduleUpdateInputs();
      };

      nodeType.prototype.scheduleUpdateInputs = debounce(function() {
        this.updateInputs();
      }, 100); 

      nodeType.prototype.updateInputs = function() {
        const prefix = "input_";
        const minInputs = 1; 

        let lastConnectedIndex = -1;
        for (let i = 0; i < this.inputs.length; i++) {
          if (this.inputs[i].name.startsWith(prefix) && this.inputs[i].link != null) {
            lastConnectedIndex = i;
          }
        }

        let removalIndex = this.inputs.length - 1;
        while (removalIndex > lastConnectedIndex && this.inputs.length > minInputs && removalIndex >= 0) {
          if (this.inputs[removalIndex].name.startsWith(prefix) && this.inputs[removalIndex].link == null) {
            if(this.inputs.length > minInputs) {
               console.log(`[MultiModel] Removing input ${this.inputs[removalIndex].name}`);
               this.removeInput(removalIndex);
            } else {
                break;
            }
          } else {
              break;
          }
          removalIndex--;
        }

        // Add a new input if the last one is connected OR if there are no inputs yet
        if (this.inputs.length === 0 || (this.inputs[this.inputs.length - 1].name.startsWith(prefix) && this.inputs[this.inputs.length - 1].link != null)) {
          const nextIndex = this.inputs.length + 1; // 1-based index for name
          const name = `${prefix}${nextIndex}`;
          console.log(`[MultiModel] Adding input ${name}`);
          this.addInput(name, "*"); 
        }

        app.graph.setDirtyCanvas(true, true);
      };
    }
  },
}); 