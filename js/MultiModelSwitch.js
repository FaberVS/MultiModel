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
      console.log(`[ModelSwitch] Patching ${nodeClassName}`);

      // --- ФУНКЦІЇ ---
      function handleModeSwitch(modeWidget, indexWidget, app, value) {
        const updateVisibility = (modeValue) => {
          if (indexWidget) {
            const shouldBeHidden = (modeValue !== "index");
            indexWidget.hidden = shouldBeHidden;
            if (app.graph) app.graph.setDirtyCanvas(true, false); 
          }
        };
        updateVisibility(value ?? modeWidget.value);
        // Перевизначаємо callback
        const originalModeCallback = modeWidget.callback;
        modeWidget.callback = (val) => {
          originalModeCallback?.apply(modeWidget, [val]); 
          updateVisibility(val);
        };
      }

      function updateDynamicInputIndexes(node) {
        console.log('[ModelSwitch] Оновлення індексів динамічних входів');
        const prefix = node._input_prefix || "input_";
        let dynamicInputs = node.inputs ? node.inputs.filter(inp => inp.name !== "mode" && inp.name !== "index") : [];
        // Перейменовуємо динамічні входи по порядку
        for (let i = 0; i < dynamicInputs.length; i++) {
            const expectedName = `${prefix}${i + 1}`;
            if (dynamicInputs[i].name !== expectedName) {
                console.log(`[ModelSwitch] Перейменування входу ${dynamicInputs[i].name} -> ${expectedName}`);
                dynamicInputs[i].name = expectedName;
            }
        }
        let maxIdx = dynamicInputs.length > 0 ? dynamicInputs.length : 1;
        node.last_connected = -1;
        for (let i = 0; i < dynamicInputs.length; i++) {
            const inp = dynamicInputs[i];
            if (inp.link != null) node.last_connected = node.inputs.indexOf(inp);
        }
        node._last_input_index = maxIdx;
        // Останній порожній динамічний вхід
        let lastEmptyIdx = -1;
        for (let i = node.inputs.length - 1; i >= 0; i--) {
            if (node.inputs[i].name !== "mode" && node.inputs[i].name !== "index" && node.inputs[i].name.startsWith(prefix) && node.inputs[i].link == null) {
                lastEmptyIdx = i;
                break;
            }
        }
        node.last_empty = lastEmptyIdx;
      }

      function updateDynamicInputsOnConnect(node, type, index, connected) {
        if (node._updatingInputs) return;
        node._updatingInputs = true;
        const changedInput = node.inputs[index];
        const inputName = changedInput?.name;
        const isDynamic = inputName && inputName !== "mode" && inputName !== "index";
        if (!isDynamic) {
            node._updatingInputs = false;
            return;
        }
        if (connected) {
            console.log(`[ModelSwitch] Вхід "${inputName}" (${index}) підключено`);
            if (index === node.last_empty) {
                const prefix = node._input_prefix || "input_";
                let dynamicInputs = node.inputs.filter(inp => inp.name !== "mode" && inp.name !== "index");
                node.addInput(`${prefix}${dynamicInputs.length + 1}`, "*");
                console.log('[ModelSwitch] Додаємо ще один порожній динамічний вхід');
                updateDynamicInputIndexes(node);
            } else {
                console.log('[ModelSwitch] Підключено не до останнього вільного входу, новий не додаємо');
            }
        } else {
            console.log(`[ModelSwitch] Вхід "${inputName}" (${index}) відключено`);
            // Якщо відключено від останнього підключеного, прибираємо цей вхід, але лише якщо порожніх динамічних входів більше одного
            let dynamicInputs = node.inputs.filter(inp => inp.name !== "mode" && inp.name !== "index");
            let emptyInputs = dynamicInputs.filter(inp => inp.link == null);
            if (index === node.last_connected && emptyInputs.length > 1) {
                node.removeInput(index);
                console.log('[ModelSwitch] Відключено від останнього підключеного — видаляємо цей вхід');
                updateDynamicInputIndexes(node);
            } else if (index === node.last_connected) {
                console.log('[ModelSwitch] Це останній порожній вхід — не видаляємо');
            } else {
                console.log('[ModelSwitch] Відключено не від останнього підключеного — нічого не робимо');
            }
        }
        node._updatingInputs = false;
      }

      function handleNodeCreation(node, app) {
        // --- Віджети ---
        const modeWidget = node.widgets.find(w => w.name === "mode");
        const indexWidget = node.widgets.find(w => w.name === "index");
        if (!modeWidget) {
            console.error(`[ModelSwitch] ${nodeClassName}: 'mode' widget not found! Cannot apply dynamic visibility.`);
            return;
        }
        if (!indexWidget) {
            console.error(`[ModelSwitch] ${nodeClassName}: 'index' widget not found! Cannot apply dynamic visibility.`);
            return;
        }
        handleModeSwitch(modeWidget, indexWidget, app);

        // --- Динамічні входи (last_empty, last_connected) ---
        node._input_prefix = "input_";
        const prefix = node._input_prefix;
        let dynamicInputs = node.inputs ? node.inputs.filter(inp => inp.name !== "mode" && inp.name !== "index") : [];
        console.log('[ModelSwitch] dynamicInputs:', dynamicInputs.map(inp => ({name: inp.name, link: inp.link})));
        // --- Якщо входів немає, додаємо перший ---
        if (dynamicInputs.length === 0) {
            console.log('[ModelSwitch] Входів немає, додаємо перший');
            node.addInput(`${prefix}1`, "*");
            dynamicInputs = node.inputs.filter(inp => inp.name !== "mode" && inp.name !== "index");
        }

        let connectedInputs = dynamicInputs.filter(inp => inp.link != null);
        let emptyInputs = dynamicInputs.filter(inp => inp.link == null);
        console.log('[ModelSwitch] connectedInputs:', connectedInputs);
        console.log('[ModelSwitch] emptyInputs:', emptyInputs);
        if (emptyInputs.length === 0) {
                console.log('[ModelSwitch] Додаємо новий порожній вхід');
                node.addInput(`${prefix}${connectedInputs.length + 1}`, "*");
                dynamicInputs = node.inputs.filter(inp => inp.name !== "mode" && inp.name !== "index");
        } else if (emptyInputs.length > 1) {
                console.log('[ModelSwitch] Видаляємо зайві порожні входи');
                for (let i = node.inputs.length - 1; i >= 0; i--) {
                    if (node.inputs[i].name !== "mode" && node.inputs[i].name !== "index" && node.inputs[i].link == null && emptyInputs.length > 1) {
                        node.removeInput(i);
                        emptyInputs.pop();
                    }
                }
                dynamicInputs = node.inputs.filter(inp => inp.name !== "mode" && inp.name !== "index");
        }
        console.log('[ModelSwitch] dynamicInputs після додавання/видалення:', dynamicInputs.map(inp => ({name: inp.name, link: inp.link})));
        updateDynamicInputIndexes(node);
        // --- Зберігаємо попередній стан links ---
        node._prevLinks = [];
        for (let i = 0; i < node.inputs.length; i++) {
            node._prevLinks[i] = node.inputs[i].link;
        }
        if (app.graph) app.graph.setDirtyCanvas(true, true);
      }

      function handleConnectionsChange(node, type, index, connected, link_info, slot, app) {
        updateDynamicInputsOnConnect(node, type, index, connected);
        node._prevLinks = [];
        for (let i = 0; i < node.inputs.length; i++) {
            node._prevLinks[i] = node.inputs[i].link;
        }
      }

      // --- Патчимо onNodeCreated ---
      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function() {
        onNodeCreated?.apply(this, arguments);
        console.log(`[ModelSwitch] ${nodeClassName} created`);
        setTimeout(() => {
          handleNodeCreation(this, app);
        }, 500);
      };

      // --- Патчимо onConnectionsChange ---
      const onConnectionsChange = nodeType.prototype.onConnectionsChange;
      nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info, slot) {
        onConnectionsChange?.apply(this, arguments);
        handleConnectionsChange(this, type, index, connected, link_info, slot, app);
      };
    }
  },
}); 