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

        // --- Віджети ---
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
        const updateVisibility = (modeValue) => {
            if (indexWidget) {
                 const shouldBeHidden = (modeValue !== "index");
                 indexWidget.hidden = shouldBeHidden;
                 app.graph.setDirtyCanvas(true, false); 
            }
        };
        const originalModeCallback = modeWidget.callback;
        modeWidget.callback = (value) => {
            originalModeCallback?.apply(modeWidget, [value]); 
            updateVisibility(value);
        };
        updateVisibility(modeWidget.value);

        // --- Динамічні входи (last_empty, last_connected) ---
        this._input_prefix = "input_";
        const prefix = this._input_prefix;
        this._last_input_index = 1;
        this.last_empty = 0;
        this.last_connected = null;
        // Якщо входів немає або немає input_1 — додаємо перший вхід
        let hasInput1 = false;
        if (this.inputs && this.inputs.length > 0) {
            for (let i = 0; i < this.inputs.length; i++) {
                if (this.inputs[i].name === `${prefix}1`) {
                    hasInput1 = true;
                    break;
                }
            }
        }
        if (!hasInput1) {
            this.addInput(`${prefix}1`, "*");
        }
        // Оновлюємо індекси для існуючих входів
        if (this.inputs && this.inputs.length > 0) {
            let maxIdx = 1;
            for (let i = 0; i < this.inputs.length; i++) {
                const inp = this.inputs[i];
                if (inp.name && inp.name.startsWith(prefix)) {
                    const idx = parseInt(inp.name.replace(prefix, ""), 10);
                    if (!isNaN(idx) && idx > maxIdx) maxIdx = idx;
                    if (inp.link != null) this.last_connected = i;
                }
            }
            this._last_input_index = maxIdx;
            this.last_empty = this.inputs.length - 1;
        }
        // --- Зберігаємо попередній стан links ---
        this._prevLinks = [];
        for (let i = 0; i < this.inputs.length; i++) {
            this._prevLinks[i] = this.inputs[i].link;
        }
        app.graph.setDirtyCanvas(true, true);
        // this.updateInputs(); // закоментовано, бо ця функція більше не використовується

        // --- Динамічна логіка підключень (last_empty, last_connected) ---
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info, slot) {
          onConnectionsChange?.apply(this, arguments);
          if (this._updatingInputs) return;
          if (type !== 1) return;
          const prefix = this._input_prefix || "input_";
          const wasLinked = this._prevLinks && this._prevLinks[index];
          const isLinked = this.inputs[index] && this.inputs[index].link;
          // Додаємо новий вхід тільки якщо було null, а стало не null
          if (
              connected &&
              index === this.last_empty &&
              wasLinked == null &&
              isLinked != null
          ) {
            this._updatingInputs = true;
            // --- Коректна нумерація ---
            let maxIdx = 0;
            for (let i = 0; i < this.inputs.length; i++) {
                const inp = this.inputs[i];
                if (inp.name && inp.name.startsWith(prefix)) {
                    const idx = parseInt(inp.name.replace(prefix, ""), 10);
                    if (!isNaN(idx) && idx > maxIdx) maxIdx = idx;
                }
            }
            this._last_input_index = maxIdx + 1;
            this.addInput(`${prefix}${this._last_input_index}`, "*");
            this.last_connected = this.last_empty;
            this.last_empty = this.inputs.length - 1;
            app.graph.setDirtyCanvas(true, true);
            this._updatingInputs = false;
          }
          // Якщо відключили будь-який вхід
          if (!connected) {
            // Знайти новий last_connected
            let new_last_connected = null;
            for (let i = this.inputs.length - 1; i >= 0; i--) {
              if (this.inputs[i].name.startsWith(prefix) && this.inputs[i].link != null) {
                new_last_connected = i;
                break;
              }
            }
            // Видалити всі порожні входи після last_connected, але залишити один (last_empty)
            let removed = false;
            for (let i = this.inputs.length - 1; i > new_last_connected + 1; i--) {
              if (this.inputs[i].name.startsWith(prefix) && this.inputs[i].link == null) {
                this.removeInput(i);
                removed = true;
              }
            }
            this.last_connected = new_last_connected;
            this.last_empty = this.inputs.length - 1;
            // Якщо останній вхід зайнятий, додаємо ще один порожній
            if (
              this.inputs.length === 0 ||
              (this.inputs[this.inputs.length - 1].name.startsWith(prefix) && this.inputs[this.inputs.length - 1].link != null)
            ) {
              // --- Коректна нумерація ---
              let maxIdx = 0;
              for (let i = 0; i < this.inputs.length; i++) {
                  const inp = this.inputs[i];
                  if (inp.name && inp.name.startsWith(prefix)) {
                      const idx = parseInt(inp.name.replace(prefix, ""), 10);
                      if (!isNaN(idx) && idx > maxIdx) maxIdx = idx;
                  }
              }
              this._last_input_index = maxIdx + 1;
              this.addInput(`${prefix}${this._last_input_index}`, "*");
              this.last_empty = this.inputs.length - 1;
              removed = true;
            }
            if (removed) {
              app.graph.setDirtyCanvas(true, true);
            }
          }
          // --- Оновлюємо _prevLinks після всіх змін ---
          this._prevLinks = [];
          for (let i = 0; i < this.inputs.length; i++) {
              this._prevLinks[i] = this.inputs[i].link;
          }
        };
        // --- Закоментовано стару логіку ---
        /*
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
          // --- Гарантуємо перший слот ---
          const dynamicInputs = this.inputs.filter(inp => inp.name && inp.name.startsWith(prefix));
          if (dynamicInputs.length === 0) {
              const name = `${prefix}1`;
              this.addInput(name, "*");
              app.graph.setDirtyCanvas(true, true);
              return;
          }
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
          if (dynamicInputs.length > 0 && this.inputs[this.inputs.length - 1].name.startsWith(prefix) && this.inputs[this.inputs.length - 1].link != null) {
            // Знаходимо найбільший індекс серед динамічних входів
            const dynamicIndexes = dynamicInputs
              .map(inp => parseInt(inp.name.replace(prefix, ""), 10))
              .filter(num => !isNaN(num));
            const maxIndex = dynamicIndexes.length > 0 ? Math.max(...dynamicIndexes) : 0;
            const nextIndex = maxIndex + 1;
            const name = `${prefix}${nextIndex}`;
            this.addInput(name, "*");
          }
          app.graph.setDirtyCanvas(true, true);
        };
        */
      };
    }
  },
}); 