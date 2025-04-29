console.log("%c[ActiveModel] JS файл завантажився! (v2-dynamic-inputs)", "color: white; background: #007acc; font-weight: bold; padding: 2px 8px; border-radius: 3px;");
// --- Loading js/active_model.js --- v2-dynamic-inputs
import { app } from "/scripts/app.js"; // Виправлено шлях на абсолютний

// Цільовий тип вузла, який ми шукаємо
const TARGET_NODE_TYPE = "ModelParamsPipe";
// Режими роботи вузлів ComfyUI/LiteGraph
const MODE_ALWAYS = 0; // Завжди активний
const MODE_BYPASS = 4; // Режим обходу (Bypass)
const NODE_TITLE = "Active Model"; // Змінено заголовок
const NODE_TYPE = "ActiveModel"; // І тип

class ActiveModel {

    // Налаштування для LiteGraph
    constructor() {
        // Цей вузол є переважно контейнером для дій
        this.properties = {};
        console.log(`[${ActiveModel.title}] CONSTRUCTOR CALLED.`);
        // Спробуємо знайти та вивести вузли одразу при створенні
        this.logTargetNodeNames();
    }

    // Статичні властивості для визначення типу вузла
    static title = "Active Model";
    static type = "ActiveModel"; // Унікальний тип для цього вузла

    // Функція для пошуку та логування імен цільових вузлів
    logTargetNodeNames() {
        console.log(`[${ActiveModel.title}] Searching for nodes of type '${TARGET_NODE_TYPE}'...`);
        const nodes = app.graph._nodes.filter(node => node.type === TARGET_NODE_TYPE);
        console.log(`[${ActiveModel.title}] Found ${nodes.length} nodes:`);
        if (nodes.length > 0) {
             nodes.forEach(n => console.log(`   - Node ID: ${n.id}, Title: ${n.title}, Current mode: ${n.mode}`));
        } else {
             console.log(`   (No nodes found)`);
        }
        return nodes; // Повертаємо для можливого використання в onAction
    }

    // Метод для встановлення режиму для всіх знайдених цільових вузлів
    setHubsMode(mode) {
        const nodes = this.logTargetNodeNames();
        if (nodes.length === 0) {
            console.log(`[${ActiveModel.title}] No target nodes found to set mode.`);
            return; // Виходимо, якщо немає цільових вузлів
        }
        const modeStr = mode === MODE_ALWAYS ? "ALWAYS" : (mode === MODE_BYPASS ? "BYPASS" : mode);
        console.log(`[${ActiveModel.title}] Attempting to set mode to ${modeStr} for ${nodes.length} nodes.`);

        let changed = false;
        for (const node of nodes) {
            console.log(`  - Processing Node ID: ${node.id}, Title: ${node.title}, Current mode: ${node.mode}`);
            if (node.mode !== mode) {
                node.mode = mode;
                console.log(`    - Mode set to: ${node.mode}`);
                changed = true;
            } else {
                console.log(`    - Mode already set to ${node.mode}. Skipping.`);
            }
        }

        if (changed) {
            console.log(`[${ActiveModel.title}] Triggering canvas redraw.`);
            app.graph.setDirtyCanvas(true, true);
        } else {
            console.log(`[${ActiveModel.title}] No modes were changed. Skipping redraw.`);
        }
    }

    // Спрощена обробка дій для тестування
    onAction(action) {
        console.log(`[${ActiveModel.title}] === onAction ENTERED === Action: ${action}`);
        // Просто логуємо знайдені вузли ще раз при виклику дії
        this.logTargetNodeNames();
        // Логіку зміни режимів поки що прибрали
        // if (action === "Bypass All Hubs") { ... }
    }

    // Цей вузол не виконує обчислень, тому onExecute може бути порожнім
    onExecute() {
        // console.log(`[${ActiveModel.title}] Executed (likely no-op).`);
    }

    // Статичний метод для налаштування та реєстрації вузла
    static setUp(clazz) {
        // Явно встановлюємо статичні властивості, які потрібні LiteGraph
        clazz.title = ActiveModel.title;
        clazz.type = ActiveModel.type;
        clazz.title_mode = LiteGraph.NORMAL_TITLE;
        clazz.collapsable = true;
        clazz.size = [240, 50];
        clazz.category = "MultiModel"; // Змінюємо категорію на основну

        console.log(`[${ActiveModel.title}] Attempting to register node type via setUp: ${clazz.type}`);
        try {
            // Реєструємо сам клас
            LiteGraph.registerNodeType(clazz.type, clazz);
            console.log(`[${ActiveModel.title}] Node type registration via setUp SUCCESSFUL.`);
        } catch (e) {
             console.error(`[${ActiveModel.title}] Node type registration via setUp FAILED:`, e);
        }
    }
}

// Визначаємо дії, доступні в контекстному меню
ActiveModel.exposedActions = ["Log Hub Names", "Enable All Hubs", "Bypass All Hubs", "Toggle All Hubs"];
// Визначаємо статичні властивості title та type тут, щоб вони були доступні для setUp
ActiveModel.title = "Active Model";
ActiveModel.type = "ActiveModel";

// --- Допоміжні функції --- //

// Функція пошуку цільових вузлів (тепер отримує їх з сервісу)
function findTargetNodes() {
    return HubNodesService.getHubNodes();
}

// Функція зміни режиму ОДНОГО вузла
function setHubMode(targetNode, mode) {
    if (!targetNode) return;
    const currentMode = targetNode.mode;
    const modeStr = mode === MODE_ALWAYS ? "ON" : "OFF";
    console.log(`[${NODE_TITLE}] Setting Node ID ${targetNode.id} ('${targetNode.title}') to mode ${modeStr}`);
    
    // Якщо ми вмикаємо вузол (MODE_ALWAYS), і при цьому поточний режим НЕ MODE_ALWAYS 
    // (тобто вузол був вимкнений, а тепер ми його вмикаємо)
    if (mode === MODE_ALWAYS && currentMode !== MODE_ALWAYS) {
        // Потрібно перевірити, чи є інші активні вузли, і вимкнути їх
        const allHubNodes = HubNodesService.getHubNodes();
        const otherActiveNodes = allHubNodes.filter(n => n.id !== targetNode.id && n.mode === MODE_ALWAYS);
        
        if (otherActiveNodes.length > 0) {
            console.log(`[${NODE_TITLE}] Found ${otherActiveNodes.length} other active nodes, disabling them...`);
            otherActiveNodes.forEach(node => {
                node.mode = MODE_BYPASS;
                console.log(`[${NODE_TITLE}] Disabled node ID ${node.id} ('${node.title}')`);
                
                // Оновлюємо віджети всіх байпасерів для цього вузла
                updateAllBypasserWidgets(node);
            });
        }
    }
    
    // Змінюємо режим цільового вузла, незалежно від того, чи є інші активні вузли
    if (currentMode !== mode) {
        targetNode.mode = mode;
        app.graph.setDirtyCanvas(true, true);
        
        // Також оновлюємо віджети для цього вузла
        updateAllBypasserWidgets(targetNode);
    }
}

// Нова функція для оновлення віджетів у всіх байпасерах для конкретного вузла
function updateAllBypasserWidgets(targetNode) {
    if (!targetNode) return;
    
    console.log(`[${NODE_TITLE}] Updating widgets for node ID: ${targetNode.id} in all bypassers`);
    const bypassers = HubNodesService.bypasserNodes;
    
    bypassers.forEach(bypasser => {
        if (!bypasser || !bypasser.widgets) return;
        
        const widgetName = `hub_${targetNode.id}`;
        const widget = bypasser.widgets.find(w => w.name === widgetName);
        
        if (widget) {
            // Оновлюємо значення віджета
            const isBypassed = targetNode.mode === MODE_BYPASS;
            const newValue = !isBypassed;
            
            // Оновлюємо також заголовок, щоб він відповідав новому формату
            const newLabel = `${targetNode.title || '(Untitled)'}`;
            
            let changed = false;
            
            if (widget.value !== newValue) {
                console.log(`[${NODE_TITLE}] Updating widget value in bypasser ID: ${bypasser.id} for node ID: ${targetNode.id} to: ${newValue}`);
                widget.value = newValue;
                changed = true;
            }
            
            if (widget.label !== newLabel) {
                console.log(`[${NODE_TITLE}] Updating widget label in bypasser ID: ${bypasser.id} for node ID: ${targetNode.id} to: "${newLabel}"`);
                widget.label = newLabel;
                changed = true;
            }
            
            if (changed) {
                bypasser.graph.setDirtyCanvas(true, false);
            }
        }
    });
}

// --- Сервіс для керування вузлами --- //
const HubNodesService = {
    hubNodes: [],
    bypasserNodes: [],
    updateTimeout: null,
    updateDelay: 100,
    app: null, // Додано для доступу до app

    registerBypasserNode(node) {
        if (!this.bypasserNodes.find(n => n.id === node.id)) {
            console.log(`[HubNodesService] Registering bypasser node ID: ${node.id}`);
            this.bypasserNodes.push(node);
            this.scheduleUpdate(`registerBypasser_${node.id}`);
        }
    },

    unregisterBypasserNode(node) {
        const index = this.bypasserNodes.findIndex(n => n.id === node.id);
        if (index !== -1) {
            console.log(`[HubNodesService] Unregistering bypasser node ID: ${node.id}`);
            this.bypasserNodes.splice(index, 1);
            // Оновлення не потрібне при видаленні самого байпасера
        } else {
             console.log(`[HubNodesService] Node ID ${node.id} not found for unregistration.`);
        }
    },

    getHubNodes() {
        return [...this.hubNodes];
    },
    
    // --- Нові методи для сповіщень від Hub --- //
    notifyHubAdded(node) {
        if (!node) return;
        console.log(`[HubNodesService] Hub node added notification received: ID ${node.id}`);
        if (!this.hubNodes.find(n => n.id === node.id)) {
            this.hubNodes.push(node);
            this.hubNodes.sort((a, b) => a.id - b.id); // Підтримуємо сортування
            this.scheduleUpdate(`notifyHubAdded_${node.id}`);
        } else {
             console.log(`[HubNodesService] Hub node ID ${node.id} already exists.`);
        }
    },
    
    notifyHubRemoved(node) {
        if (!node) return;
        console.log(`[HubNodesService] Hub node removed notification received: ID ${node.id}`);
        const index = this.hubNodes.findIndex(n => n.id === node.id);
        if (index !== -1) {
            this.hubNodes.splice(index, 1);
            this.scheduleUpdate(`notifyHubRemoved_${node.id}`);
        } else {
            console.log(`[HubNodesService] Hub node ID ${node.id} not found for removal notification.`);
        }
    },

    notifyHubRenamed(node) {
         if (!node) return;
        console.log(`[HubNodesService] Hub node rename notification received: ID ${node.id}`);
        // Сам список hubNodes містить посилання на об'єкти вузлів,
        // тому оновлювати список не потрібно, зміна title вже відбулася.
        // Просто плануємо оновлення віджетів, щоб відобразити нову назву.
        this.scheduleUpdate(`notifyHubRenamed_${node.id}`);
    },
    // --- Кінець нових методів --- //

    scheduleUpdate(reason = "unknown") {
        console.log(`[HubNodesService] Scheduling update. Reason: ${reason}`);
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(() => {
            console.log("[HubNodesService] Timeout reached. Running update...");
            this.updateTimeout = null;
            // Оновлення списку hubNodes більше не потрібне тут
            // this.refreshHubNodes(); 
            this.bypasserNodes.forEach(node => {
                 if (node.refreshWidgets) {
                    console.log(`[HubNodesService] Refreshing widgets for bypasser node ID: ${node.id}`);
                    node.refreshWidgets();
                 } else {
                     console.warn(`[HubNodesService] Bypasser node ID: ${node.id} missing refreshWidgets method.`);
                 }
            });
             console.log("[HubNodesService] Update finished.");
        }, this.updateDelay);
    }
};

app.registerExtension({
    name: "MultiModel.ActiveModel.ServiceDriven", // Оновлено назву розширення

    setup(appInstance) {
        console.log(`[${NODE_TITLE}] === Extension setup CALLED ===`);
        // Реєструємо сервіс, щоб він був доступний іншим розширенням
        appInstance.HubNodesService = HubNodesService;
        HubNodesService.app = appInstance; 

        // Додаємо перехоплення onNodeAdded для відстеження додавання нашої ноди
        if (appInstance.graph && !appInstance.graph._activemodel_onNodeAdded_attached) {
            const origNodeAdded = appInstance.graph.onNodeAdded;
            
            appInstance.graph.onNodeAdded = function(node) {
                // Спочатку викликаємо оригінальний обробник
                if (origNodeAdded) {
                    origNodeAdded.call(this, node);
                }
                
                // Перевіряємо, чи це наша нода ActiveModel
                if (node.type === NODE_TYPE) {
                    console.log(`[${NODE_TITLE}] Our node type was added to graph: ID ${node.id}`);
                    
                    // Викликаємо обробку ноди для додавання віджетів
                    const extension = appInstance.extensions.find(ext => ext.name === "MultiModel.ActiveModel.ServiceDriven");
                    if (extension) {
                        // Конфігуруємо ноду
                        extension.loadedGraphNode(node, appInstance);
                        
                        // Оновлюємо віджети з невеликою затримкою
                        setTimeout(() => {
                            if (node.refreshWidgets) {
                                console.log(`[${NODE_TITLE}] Running refreshWidgets for newly added node ID: ${node.id}`);
                                node.refreshWidgets();
                            }
                        }, 100);
                    }
                }
            };
            
            appInstance.graph._activemodel_onNodeAdded_attached = true;
            console.log(`[${NODE_TITLE}] Attached our onNodeAdded handler to graph`);
        }
        
        // Початкове сканування потрібне, щоб знайти вузли, які вже існують при завантаженні
        setTimeout(() => {
             console.log("[HubNodesService] Initial node scan after setup.");
             // Знаходимо існуючі Hub та Bypasser ноди і реєструємо їх
             let initialHubsFound = 0;
             let initialBypassersFound = 0;
             appInstance.graph._nodes.forEach(node => {
                 if (node.type === TARGET_NODE_TYPE) {
                     HubNodesService.notifyHubAdded(node);
                     initialHubsFound++;
                 } else if (node.type === NODE_TYPE) {
                     // Реєстрація bypasser'а відбувається також у loadedGraphNode,
                     // але продублюємо тут на випадок проблем з порядком
                     HubNodesService.registerBypasserNode(node);
                     initialBypassersFound++;
                     
                     // Додаємо додаткову ініціалізацію для вже існуючих Bypasser нод
                     this.loadedGraphNode(node, appInstance);
                 }
             });
             console.log(`[HubNodesService] Initial scan found ${initialHubsFound} hubs and ${initialBypassersFound} bypassers.`);
             
             // Додаємо окремий виклик для оновлення віджетів для всіх bypassers з більшою затримкою
             if (initialBypassersFound > 0) {
                 setTimeout(() => {
                     console.log(`[${NODE_TITLE}] Refreshing widgets for ${initialBypassersFound} bypassers after initial scan`);
                     HubNodesService.bypasserNodes.forEach(node => {
                         if (node && node.refreshWidgets) {
                             node.refreshWidgets();
                         }
                     });
                 }, 500);
             }
             
             // Оновлення віджетів запланується всередині notifyHubAdded/registerBypasserNode
        }, 500);
    },

    // loadedGraphNode тепер відповідає ТІЛЬКИ за конфігурацію САМОГО ActiveModel
    loadedGraphNode(node, appInstance) {
        if (node.type === NODE_TYPE) {
            console.log(`[${NODE_TITLE}] Configuring node instance ID: ${node.id}`);
            node.app = appInstance;
            node.IS_BYPASSER_NODE = true;
            delete node.onAction; // Видаляємо, бо додамо getActions

            // Визначаємо refreshWidgets
            node.refreshWidgets = function() {
                console.log(`[${NODE_TITLE} ID: ${this.id}] Running refreshWidgets...`);
                const targetNodes = findTargetNodes(); // Отримуємо з сервісу
                console.log(`[${NODE_TITLE} ID: ${this.id}] Got ${targetNodes.length} target nodes from service.`);
                
                // Додаємо детальну діагностику
                if (targetNodes.length === 0) {
                    console.log(`[${NODE_TITLE} ID: ${this.id}] No target nodes found. HubNodesService state:`, 
                                {hubNodesCount: HubNodesService.hubNodes.length,
                                 bypassersCount: HubNodesService.bypasserNodes.length});
                } else {
                    console.log(`[${NODE_TITLE} ID: ${this.id}] Target nodes details:`, 
                                targetNodes.map(n => ({id: n.id, title: n.title, mode: n.mode})));
                }

                // --- Подальша логіка залишається ТАКОЮ Ж САМОЮ, як і раніше --- 
                // (Порівняння віджетів, додавання, видалення, оновлення)
                const currentWidgets = this.widgets ? [...this.widgets] : [];
                let widgetsChanged = false;
                const activeWidgetNames = new Set();

                // Add/Update widgets
                targetNodes.forEach(targetNode => {
                    if (!targetNode) {
                         console.warn(`[${NODE_TITLE} ID: ${this.id}] Found a null/undefined targetNode in the list from service. Skipping.`);
                         return; // Пропускаємо невалідні ноди
                    }
                    const widgetName = `hub_${targetNode.id}`;
                    // Прибираємо ID ноди з заголовка
                    const widgetLabel = `${targetNode.title || '(Untitled)'}`;
                    const isBypassed = targetNode.mode === MODE_BYPASS;
                    const widgetValue = !isBypassed;

                    activeWidgetNames.add(widgetName);

                    let existingWidget = this.widgets?.find(w => w.name === widgetName);

                    if (existingWidget) {
                        let labelChanged = false;
                        if (existingWidget.label !== widgetLabel) {
                             existingWidget.label = widgetLabel;
                             labelChanged = true;
                        }
                         if (existingWidget.value !== widgetValue) {
                             existingWidget.value = widgetValue;
                             widgetsChanged = true;
                         }
                         if (labelChanged) widgetsChanged = true;

                         if (!existingWidget.callback) {
                              existingWidget.callback = (value) => {
                                  // Нова логіка: якщо перемикач вмикається, вимикаємо всі інші
                                  // якщо вимикається - просто вимикаємо
                                  const nodeToChange = app.graph.getNodeById(targetNode.id);
                                  if (nodeToChange) setHubMode(nodeToChange, value ? MODE_ALWAYS : MODE_BYPASS);
                              };
                              widgetsChanged = true;
                         }
                    } else {
                        this.addWidget(
                            "toggle", widgetName, widgetValue,
                            (value) => {
                                // Нова логіка: дозволяємо будь-які переключення
                                const nodeToChange = app.graph.getNodeById(targetNode.id);
                                if (nodeToChange) setHubMode(nodeToChange, value ? MODE_ALWAYS : MODE_BYPASS);
                                else this.refreshWidgets();
                            },
                            { on: "ON", off: "OFF" }
                        );
                        this.widgets[this.widgets.length - 1].label = widgetLabel;
                        widgetsChanged = true;
                    }
                });

                // Remove outdated widgets
                let removedWidgets = false;
                if (this.widgets) {
                    for (let i = this.widgets.length - 1; i >= 0; i--) {
                        const widget = this.widgets[i];
                        if (widget.name?.startsWith("hub_") && !activeWidgetNames.has(widget.name)) {
                            this.widgets.splice(i, 1);
                            widgetsChanged = true;
                            removedWidgets = true;
                        }
                    }
                }

                // Resize node only if widgets were added/removed
                if (widgetsChanged) {
                    // ... (логіка зміни розміру залишається такою ж) ...
                    const baseHeight = LiteGraph.NODE_TITLE_HEIGHT + 5;
                    const widgetHeight = LiteGraph.NODE_WIDGET_HEIGHT;
                    const spacing = 4;
                    const hubWidgets = this.widgets?.filter(w => w.name?.startsWith("hub_")) || [];
                    const numWidgets = hubWidgets.length;
                    const requiredHeight = baseHeight + numWidgets * (widgetHeight + spacing) + (numWidgets > 0 ? spacing : 0);
                    const computedSize = this.computeSize();
                    const newHeight = Math.max(computedSize[1], requiredHeight);
                    if (Math.abs(this.size[1] - newHeight) > 2 || removedWidgets) { 
                       this.size[1] = newHeight;
                       this.graph.setDirtyCanvas(true, true);
                    } else if (widgetsChanged) {
                        this.graph.setDirtyCanvas(true, false);
                    }
                }
                
                // Перевірка на кількість активних вузлів після оновлення віджетів
                setTimeout(() => {
                    const activeNodes = targetNodes.filter(node => node.mode === MODE_ALWAYS);
                    console.log(`[${NODE_TITLE} ID: ${this.id}] After refresh: ${activeNodes.length} active nodes`);
                    
                    // Якщо більше одного активного вузла, залишаємо тільки перший
                    // Але не активуємо автоматично вузли, якщо всі вимкнені
                    if (activeNodes.length > 1) {
                        console.log(`[${NODE_TITLE} ID: ${this.id}] Multiple active nodes (${activeNodes.length}), keeping only the first one...`);
                        // Залишаємо перший вузол активним, інші вимикаємо
                        for (let i = 1; i < activeNodes.length; i++) {
                            setHubMode(activeNodes[i], MODE_BYPASS);
                            
                            // Оновлюємо відповідний віджет
                            const widgetName = `hub_${activeNodes[i].id}`;
                            const widget = this.widgets?.find(w => w.name === widgetName);
                            if (widget) {
                                widget.value = false;
                            }
                        }
                        this.graph.setDirtyCanvas(true, false);
                    }
                }, 100);
                
                console.log(`[${NODE_TITLE} ID: ${this.id}] refreshWidgets finished.`);
            };

            // Визначаємо дії для контекстного меню
            node.getActions = function() {
                 const actions = [];
                 if (this.widgets?.some(w => w.name.startsWith("hub_"))) {
                     actions.push({ name: "Activate First Hub", callback: () => this.setAllHubsMode(MODE_ALWAYS) });
                     actions.push({ name: "Switch To Next Hub", callback: () => this.toggleAllHubsMode() });
                 }
                 actions.push({ name: "Log Hub Names (Console)", callback: () => this.logTargetNodeNames() });
                 return actions;
            };
            node.logTargetNodeNames = function() { // Додаємо метод до екземпляра
                console.log(`[${NODE_TITLE} ID: ${this.id}] Logging target node names...`);
                 const nodes = HubNodesService.getHubNodes();
                 console.log(`   Found ${nodes.length} nodes via service:`);
                 if (nodes.length > 0) {
                      nodes.forEach(n => console.log(`   - Node ID: ${n.id}, Title: ${n.title}, Current mode: ${n.mode}`));
                 } else {
                      console.log(`   (No nodes found)`);
                 }
            };
            
            // Оновлений метод для встановлення режиму всіх хабів
            node.setAllHubsMode = function(mode) { 
                console.log(`[${NODE_TITLE} ID: ${this.id}] setAllHubsMode called with mode: ${mode}`);
                const hubNodes = HubNodesService.getHubNodes();
                
                if (hubNodes.length === 0) {
                    console.log(`[${NODE_TITLE} ID: ${this.id}] No hub nodes found to set mode.`);
                    return;
                }
                
                if (mode === MODE_ALWAYS) {
                    // Активуємо тільки перший вузол, інші вимикаємо
                    console.log(`[${NODE_TITLE} ID: ${this.id}] Enabling only the first hub node, disabling others.`);
                    
                    hubNodes.forEach((node, index) => {
                        const newMode = index === 0 ? MODE_ALWAYS : MODE_BYPASS;
                        
                        if (node.mode !== newMode) {
                            node.mode = newMode;
                            updateAllBypasserWidgets(node);
                        }
                    });
                    
                    app.graph.setDirtyCanvas(true, true);
                } else if (mode === MODE_BYPASS) {
                    // Якщо режим BYPASS, вимикаємо всі вузли
                    console.log(`[${NODE_TITLE} ID: ${this.id}] Disabling all hub nodes.`);
                    
                    let changed = false;
                    hubNodes.forEach(node => {
                        if (node.mode !== MODE_BYPASS) {
                            node.mode = MODE_BYPASS;
                            updateAllBypasserWidgets(node);
                            changed = true;
                        }
                    });
                    
                    if (changed) {
                        app.graph.setDirtyCanvas(true, true);
                    }
                }
            };
            
            // Оновлений метод для перемикання вузлів
            node.toggleAllHubsMode = function() {
                console.log(`[${NODE_TITLE} ID: ${this.id}] toggleAllHubsMode called`);
                const hubNodes = HubNodesService.getHubNodes();
                
                if (hubNodes.length === 0) {
                    console.log(`[${NODE_TITLE} ID: ${this.id}] No hub nodes found to toggle.`);
                    return;
                }
                
                // Перевіряємо, чи є хоча б один активний вузол
                const activeNodes = hubNodes.filter(n => n.mode === MODE_ALWAYS);
                
                if (activeNodes.length === 0) {
                    // Якщо немає активних вузлів, активуємо перший
                    console.log(`[${NODE_TITLE} ID: ${this.id}] No active nodes, activating the first one.`);
                    if (hubNodes.length > 0) {
                        const node = hubNodes[0];
                        node.mode = MODE_ALWAYS;
                        updateAllBypasserWidgets(node);
                        app.graph.setDirtyCanvas(true, true);
                    }
                } else {
                    // Якщо є активний вузол, знаходимо його індекс і активуємо наступний
                    const activeNode = activeNodes[0];
                    const currentIndex = hubNodes.findIndex(n => n.id === activeNode.id);
                    
                    // Вимикаємо поточний активний вузол
                    activeNode.mode = MODE_BYPASS;
                    updateAllBypasserWidgets(activeNode);
                    
                    // Знаходимо наступний вузол (або переходимо до першого, якщо це останній)
                    const nextIndex = (currentIndex + 1) % hubNodes.length;
                    const nextNode = hubNodes[nextIndex];
                    
                    console.log(`[${NODE_TITLE} ID: ${this.id}] Toggling from node ID ${activeNode.id} to node ID ${nextNode.id}`);
                    
                    // Активуємо наступний вузол
                    nextNode.mode = MODE_ALWAYS;
                    updateAllBypasserWidgets(nextNode);
                    
                    app.graph.setDirtyCanvas(true, true);
                }
            };

            // Реєстрація/видалення самого bypasser'а в сервісі
            node.onAdded = function() {
                 console.log(`[${NODE_TITLE} ID: ${this.id}] Bypasser node added to graph. Registering with service.`);
                 if (appInstance.HubNodesService) { // Перевіряємо наявність сервісу
                     appInstance.HubNodesService.registerBypasserNode(this);
                 } else {
                      console.error(`[${NODE_TITLE} ID: ${this.id}] Cannot register bypasser, HubNodesService not found!`);
                 }
            };
            node.onRemoved = function() {
                 console.log(`[${NODE_TITLE} ID: ${this.id}] Bypasser node removed from graph. Unregistering from service.`);
                  if (appInstance.HubNodesService) {
                      appInstance.HubNodesService.unregisterBypasserNode(this);
                  } else {
                      console.error(`[${NODE_TITLE} ID: ${this.id}] Cannot unregister bypasser, HubNodesService not found!`);
                  }
            };
            
            // Початкова реєстрація, якщо вузол вже існує при завантаженні
            if (appInstance.HubNodesService) {
                 appInstance.HubNodesService.registerBypasserNode(node);
            } else {
                 // Якщо сервіс ще не створено (малоймовірно, але можливо), 
                 // реєстрація відбудеться пізніше через onAdded
                 console.warn(`[${NODE_TITLE} ID: ${node.id}] Initial registration deferred, HubNodesService not yet available.`);
            }
            
            // Початкове оновлення віджетів для цього конкретного вузла
             setTimeout(() => { if (node.refreshWidgets) node.refreshWidgets(); }, 50);
        }
    },

    getExtraMenuOptions(_, options) {
        options.push({
            content: "Add Active Model",
            callback: () => {
                const node = LiteGraph.createNode(NODE_TYPE);
                // Записуємо текст для коментаря, щоб показати функціональність
                node.properties.desc = "Controls the flow of Model Parameters Pipe Hubs";
                app.graph.add(node);
                
                // Розміщення вузла в центрі видимої області
                const canvas = app.canvas;
                const visible_rect = canvas.visible_area;
                node.pos[0] = visible_rect[0] + visible_rect[2] * 0.5 - node.size[0] * 0.5;
                node.pos[1] = visible_rect[1] + visible_rect[3] * 0.5 - node.size[1] * 0.5;

                console.log(`[${NODE_TITLE}] Node created from menu with ID: ${node.id}`);
                
                // Явно налаштуємо ноду після створення з меню
                if (app.HubNodesService) {
                    // Отримуємо розширення
                    const extension = app.extensions.find(ext => ext.name === "MultiModel.ActiveModel.ServiceDriven");
                    if (extension) {
                        // Конфігуруємо ноду
                        console.log(`[${NODE_TITLE}] Manually configuring node created from menu`);
                        extension.loadedGraphNode(node, app);
                        
                        // Оновлюємо віджети з затримкою
                        setTimeout(() => {
                            if (node.refreshWidgets) {
                                console.log(`[${NODE_TITLE}] Refreshing widgets for node created from menu`);
                                node.refreshWidgets();
                            }
                        }, 100);
                    }
                }
            }
        });
    },

    nodeRegistered(type, clazz) {
        console.log(`[${NODE_TITLE}] nodeRegistered called for type: ${type}`);
        if (type === NODE_TYPE) {
            try {
                console.log(`[${NODE_TITLE}] Running additional setup for our node type`);
                ActiveModel.setUp(clazz);
            } catch (e) {
                console.error(`[${NODE_TITLE}] Error in additional node setup:`, e);
            }
        }
    },
    
    // Додаємо обробники створення ноди для максимального покриття
    nodeCreated(node) {
        console.log(`[${NODE_TITLE}] nodeCreated called for node type: ${node?.type || 'undefined'}, ID: ${node?.id || 'undefined'}`);
        
        if (node && node.type === NODE_TYPE) {
            console.log(`[${NODE_TITLE}] Our node created, configuring it...`);
            this.loadedGraphNode(node, app);
            
            // Запускаємо оновлення віджетів з затримкою
            setTimeout(() => {
                if (node.refreshWidgets) {
                    console.log(`[${NODE_TITLE}] Refreshing widgets after node creation`);
                    node.refreshWidgets();
                }
            }, 100);
        }
    },
    
    onNodeAdded(node) {
        console.log(`[${NODE_TITLE}] onNodeAdded callback called for node type: ${node?.type || 'undefined'}, ID: ${node?.id || 'undefined'}`);
        
        if (node && node.type === NODE_TYPE) {
            console.log(`[${NODE_TITLE}] Our node added via onNodeAdded, configuring it...`);
            this.loadedGraphNode(node, app);
            
            // Запускаємо оновлення віджетів з затримкою
            setTimeout(() => {
                if (node.refreshWidgets) {
                    console.log(`[${NODE_TITLE}] Refreshing widgets after node was added`);
                    node.refreshWidgets();
                }
            }, 100);
        }
    }
});

console.log(`[${NODE_TITLE}] JS file loaded`); 