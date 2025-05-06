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
        // Спробуємо знайти та вивести вузли одразу при створенні
        this.logTargetNodeNames();
    }

    // Статичні властивості для визначення типу вузла
    static title = "Active Model";
    static type = "ActiveModel"; // Унікальний тип для цього вузла

    // Функція для пошуку та логування імен цільових вузлів
    logTargetNodeNames() {
        const nodes = app.graph._nodes.filter(node => node.type === TARGET_NODE_TYPE);
        return nodes; // Повертаємо для можливого використання в onAction
    }

    // Метод для встановлення режиму для всіх знайдених цільових вузлів
    setHubsMode(mode) {
        const nodes = this.logTargetNodeNames();
        if (nodes.length === 0) {
            return; // Виходимо, якщо немає цільових вузлів
        }
        const modeStr = mode === MODE_ALWAYS ? "ALWAYS" : (mode === MODE_BYPASS ? "BYPASS" : mode);

        let changed = false;
        for (const node of nodes) {
            if (node.mode !== mode) {
                node.mode = mode;
                changed = true;
            }
        }

        if (changed) {
            app.graph.setDirtyCanvas(true, true);
        }
    }

    // Спрощена обробка дій для тестування
    onAction(action) {
        // Просто логуємо знайдені вузли ще раз при виклику дії
        this.logTargetNodeNames();
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

        try {
            // Реєструємо сам клас
            LiteGraph.registerNodeType(clazz.type, clazz);
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

// --- Нова функція для оновлення всіх перемикачів для всіх хабів ---
function updateAllBypasserWidgetsForAllHubs() {
    const allHubNodes = HubNodesService.getHubNodes();
    allHubNodes.forEach(hubNode => {
        updateAllBypasserWidgets(hubNode);
    });
}

// Функція зміни режиму ОДНОГО вузла
function setHubMode(targetNode, mode) {
    if (!targetNode) return;
    const currentMode = targetNode.mode;
    // const modeStr = mode === MODE_ALWAYS ? "ON" : "OFF";
    // console.log(`[setHubMode] Перемикач вузла id=${targetNode.id} → ${modeStr}`);
    // Якщо ми вмикаємо вузол (MODE_ALWAYS), і при цьому поточний режим НЕ MODE_ALWAYS 
    if (mode === MODE_ALWAYS && currentMode !== MODE_ALWAYS) {
        const allHubNodes = HubNodesService.getHubNodes();
        const otherActiveNodes = allHubNodes.filter(n => n.id !== targetNode.id && n.mode === MODE_ALWAYS);
        if (otherActiveNodes.length > 0) {
            otherActiveNodes.forEach(node => {
                // console.log(`[setHubMode] Вимикаємо інший перемикач id=${node.id} → OFF`);
                node.mode = MODE_BYPASS;
            });
        }
    }
    if (currentMode !== mode) {
        targetNode.mode = mode;
        app.graph.setDirtyCanvas(true, true);
    } else {
        // console.log(`[setHubMode] Перемикач вузла id=${targetNode.id} вже у стані ${modeStr}, зміна не потрібна.`);
    }
    updateAllBypasserWidgetsForAllHubs();
}

// Нова функція для оновлення віджетів у всіх байпасерах для конкретного вузла
function updateAllBypasserWidgets(targetNode) {
    if (!targetNode) return;
    
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
                widget.value = newValue;
                changed = true;
            }
            
            if (widget.label !== newLabel) {
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
            this.bypasserNodes.push(node);
            this.scheduleUpdate(`registerBypasser_${node.id}`);
        }
    },

    unregisterBypasserNode(node) {
        const index = this.bypasserNodes.findIndex(n => n.id === node.id);
        if (index !== -1) {
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
        this.scheduleUpdate(`notifyHubRenamed_${node.id}`);
    },
    // --- Кінець нових методів --- //

    scheduleUpdate(reason = "unknown") {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(() => {
            this.updateTimeout = null;
            this.bypasserNodes.forEach(node => {
                 if (node.refreshWidgets) {
                    node.refreshWidgets();
                 } else {
                     console.warn(`[HubNodesService] Bypasser node ID: ${node.id} missing refreshWidgets method.`);
                 }
            });
        }, this.updateDelay);
    }
};

app.registerExtension({
    name: "MultiModel.ActiveModel.ServiceDriven", // Оновлено назву розширення

    setup(appInstance) {
        console.log("[MultiModel] ✅ Ініціалізовано HubNodesService у app.HubNodesService");
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
                    // Викликаємо обробку ноди для додавання віджетів
                    const extension = appInstance.extensions.find(ext => ext.name === "MultiModel.ActiveModel.ServiceDriven");
                    if (extension) {
                        // Конфігуруємо ноду
                        extension.loadedGraphNode(node, appInstance);
                        
                        // Оновлюємо віджети з невеликою затримкою
                        setTimeout(() => {
                            if (node.refreshWidgets) {
                                node.refreshWidgets();
                            }
                        }, 100);
                    }
                }
            };
            
            appInstance.graph._activemodel_onNodeAdded_attached = true;
        }
        
        // Початкове сканування потрібне, щоб знайти вузли, які вже існують при завантаженні
        setTimeout(() => {
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
             
             // Додаємо окремий виклик для оновлення віджетів для всіх bypassers з більшою затримкою
             if (initialBypassersFound > 0) {
                 setTimeout(() => {
                     HubNodesService.bypasserNodes.forEach(node => {
                         if (node && node.refreshWidgets) {
                             node.refreshWidgets();
                         }
                     });
                 }, 500);
             }
        }, 500);
    },

    // loadedGraphNode тепер відповідає ТІЛЬКИ за конфігурацію САМОГО ActiveModel
    loadedGraphNode(node, appInstance) {
        if (node.type === NODE_TYPE) {
            node.app = appInstance;
            node.IS_BYPASSER_NODE = true;
            delete node.onAction; // Видаляємо, бо додамо getActions

            // Визначаємо refreshWidgets
            node.refreshWidgets = function() {
                const targetNodes = findTargetNodes(); // Отримуємо з сервісу
                
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

                         // --- Виправлений callback: взаємовиключна логіка ---
                         existingWidget.callback = (value) => {
                             const hubNodes = HubNodesService.getHubNodes();
                             const nodeToActivate = app.graph.getNodeById(targetNode.id);
                             if (value) {
                                 // Вимикаємо всі інші, вмикаємо лише обраний
                                 hubNodes.forEach(n => {
                                     const nObj = app.graph.getNodeById(n.id);
                                     if (nObj) nObj.mode = (n.id === targetNode.id) ? MODE_ALWAYS : MODE_BYPASS;
                                 });
                             } else {
                                 // Якщо вимикаємо, просто переводимо цей вузол у BYPASS
                                 if (nodeToActivate) nodeToActivate.mode = MODE_BYPASS;
                             }
                             // Оновлюємо всі віджети
                             if (this.refreshWidgets) this.refreshWidgets();
                         };
                         widgetsChanged = true;
                    } else {
                        this.addWidget(
                            "toggle", widgetName, widgetValue,
                            (value) => {
                                const hubNodes = HubNodesService.getHubNodes();
                                const nodeToActivate = app.graph.getNodeById(targetNode.id);
                                if (value) {
                                    hubNodes.forEach(n => {
                                        const nObj = app.graph.getNodeById(n.id);
                                        if (nObj) nObj.mode = (n.id === targetNode.id) ? MODE_ALWAYS : MODE_BYPASS;
                                    });
                                } else {
                                    if (nodeToActivate) nodeToActivate.mode = MODE_BYPASS;
                                }
                                if (this.refreshWidgets) this.refreshWidgets();
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
                    
                    // Якщо більше одного активного вузла, залишаємо тільки перший
                    // Але не активуємо автоматично вузли, якщо всі вимкнені
                    if (activeNodes.length > 1) {
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
                 const nodes = HubNodesService.getHubNodes();
            };
            
            // Оновлений метод для встановлення режиму всіх хабів
            node.setAllHubsMode = function(mode) { 
                const hubNodes = HubNodesService.getHubNodes();
                
                if (hubNodes.length === 0) {
                    return;
                }
                
                if (mode === MODE_ALWAYS) {
                    // Активуємо тільки перший вузол, інші вимикаємо
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
                    hubNodes.forEach(node => {
                        if (node.mode !== MODE_BYPASS) {
                            node.mode = MODE_BYPASS;
                            updateAllBypasserWidgets(node);
                        }
                    });
                    
                    app.graph.setDirtyCanvas(true, true);
                }
            };
            
            // Оновлений метод для перемикання вузлів
            node.toggleAllHubsMode = function() {
                const hubNodes = HubNodesService.getHubNodes();
                
                if (hubNodes.length === 0) {
                    return;
                }
                
                // Перевіряємо, чи є хоча б один активний вузол
                const activeNodes = hubNodes.filter(n => n.mode === MODE_ALWAYS);
                
                if (activeNodes.length === 0) {
                    // Якщо немає активних вузлів, активуємо перший
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
                    
                    // Активуємо наступний вузол
                    nextNode.mode = MODE_ALWAYS;
                    updateAllBypasserWidgets(nextNode);
                    
                    app.graph.setDirtyCanvas(true, true);
                }
            };

            // Реєстрація/видалення самого bypasser'а в сервісі
            node.onAdded = function() {
                 if (appInstance.HubNodesService) { // Перевіряємо наявність сервісу
                     appInstance.HubNodesService.registerBypasserNode(this);
                 } else {
                      console.error(`[${NODE_TITLE} ID: ${this.id}] Cannot register bypasser, HubNodesService not found!`);
                 }
            };
            node.onRemoved = function() {
                  if (appInstance.HubNodesService) {
                      appInstance.HubNodesService.unregisterBypasserNode(this);
                  } else {
                      console.error(`[${NODE_TITLE} ID: ${this.id}] Cannot unregister bypasser, HubNodesService not found!`);
                  }
            };
            
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

                // Явно налаштуємо ноду після створення з меню
                if (app.HubNodesService) {
                    // Отримуємо розширення
                    const extension = app.extensions.find(ext => ext.name === "MultiModel.ActiveModel.ServiceDriven");
                    if (extension) {
                        // Конфігуруємо ноду
                        extension.loadedGraphNode(node, app);
                        
                        // Оновлюємо віджети з затримкою
                        setTimeout(() => {
                            if (node.refreshWidgets) {
                                node.refreshWidgets();
                            }
                        }, 100);
                    }
                }
            }
        });
    },

    nodeRegistered(type, clazz) {
        if (type === NODE_TYPE) {
            try {
                ActiveModel.setUp(clazz);
            } catch (e) {
                console.error(`[${NODE_TITLE}] Error in additional node setup:`, e);
            }
        }
    },
    
    // Додаємо обробники створення ноди для максимального покриття
    nodeCreated(node) {
        if (node && node.type === NODE_TYPE) {
            this.loadedGraphNode(node, app);
            
            // Запускаємо оновлення віджетів з затримкою
            setTimeout(() => {
                if (node.refreshWidgets) {
                    node.refreshWidgets();
                }
            }, 100);
        }
    },
    
    onNodeAdded(node) {
        if (node && node.type === NODE_TYPE) {
            this.loadedGraphNode(node, app);
            
            // Запускаємо оновлення віджетів з затримкою
            setTimeout(() => {
                if (node.refreshWidgets) {
                    node.refreshWidgets();
                }
            }, 100);
        }
    }
});

// --- ModelParamsPipe Notifier (інтегровано з ModelParamsNodeExt.js) ---
(function(){
    const TARGET_NODE_TYPE = "ModelParamsPipe";
    app.registerExtension({
        name: "MultiModel.ModelParamsPipeNode.Notifier",
        newNodesDetected: false,
        async setup() {
            // Чекаємо на HubNodesService
            const waitForHubNodesService = async (timeout = 5000) => {
                const start = Date.now();
                while (!app.HubNodesService) {
                    if (Date.now() - start > timeout) {
                        throw new Error("HubNodesService not found after waiting");
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
            };
            await waitForHubNodesService();
            // Додаємо базову ініціалізацію та прямий пошук вузлів
            const checkForGraph = () => {
                if (app.graph) {
                    if (app.graph.onNodeAdded && !app.graph._notifier_attached) {
                        const origNodeAdded = app.graph.onNodeAdded;
                        app.graph.onNodeAdded = function(node) {
                            if (origNodeAdded) origNodeAdded.call(this, node);
                            if (node.type === TARGET_NODE_TYPE) {
                                const extension = app.extensions.find(ext => ext.name === "MultiModel.ModelParamsPipeNode.Notifier");
                                if (extension) {
                                    extension.setupNodeMonitoring(node);
                                    if (app.HubNodesService) {
                                        app.HubNodesService.notifyHubAdded(node);
                                        if (typeof app.HubNodesService.forceUpdates === 'function') {
                                            app.HubNodesService.forceUpdates();
                                        } else if (typeof app.HubNodesService.updateWidgets === 'function') {
                                            app.HubNodesService.updateWidgets();
                                        } else if (app.HubNodesService.refreshUI && typeof app.HubNodesService.refreshUI === 'function') {
                                            app.HubNodesService.refreshUI();
                                        }
                                    }
                                }
                            }
                        };
                        app.graph._notifier_attached = true;
                    }
                    setTimeout(() => {
                        if (!app.graph || !app.graph._nodes) return;
                        const targetNodes = app.graph._nodes.filter(node => node.type === TARGET_NODE_TYPE);
                        const extension = app.extensions.find(ext => ext.name === "MultiModel.ModelParamsPipeNode.Notifier");
                        if (!extension) return;
                        for (const node of targetNodes) {
                            extension.setupNodeMonitoring(node);
                        }
                        if (targetNodes.length > 0 && app.HubNodesService) {
                            if (typeof app.HubNodesService.forceUpdates === 'function') {
                                app.HubNodesService.forceUpdates();
                            } else if (typeof app.HubNodesService.updateWidgets === 'function') {
                                app.HubNodesService.updateWidgets();
                            } else if (app.HubNodesService.refreshUI && typeof app.HubNodesService.refreshUI === 'function') {
                                app.HubNodesService.refreshUI();
                            }
                        }
                    }, 500);
                } else {
                    setTimeout(checkForGraph, 500);
                }
            };
            checkForGraph();
        },
        setupNodeMonitoring(node, appInstance = app) {
            if (!node) return false;
            if (!node.__title_monitored) {
                try {
                    const originalTitle = node.title;
                    if (!Object.getOwnPropertyDescriptor(node, '_monitored_title')) {
                        Object.defineProperty(node, '_monitored_title', {
                            value: originalTitle,
                            writable: true
                        });
                    }
                    const titleDescriptor = Object.getOwnPropertyDescriptor(node, 'title');
                    if (!titleDescriptor || titleDescriptor.configurable) {
                        Object.defineProperty(node, 'title', {
                            get: function() { return this._monitored_title; },
                            set: function(newTitle) {
                                if (this._monitored_title === newTitle) return;
                                this._monitored_title = newTitle;
                                setTimeout(() => {
                                    if (appInstance.HubNodesService) {
                                        appInstance.HubNodesService.notifyHubRenamed(this);
                                    } else {
                                        console.error(`     HubNodesService not found! Cannot notify rename.`);
                                    }
                                }, 0);
                            },
                            enumerable: true,
                            configurable: true
                        });
                    }
                    node.__title_monitored = true;
                } catch (error) {
                    console.error(`[${TARGET_NODE_TYPE} Notifier] Error setting up title monitoring:`, error);
                }
            }
            if (!node.onRemoved || !node.onRemoved.__isNotifierOverridden) {
                try {
                    const originalOnRemoved = node.onRemoved;
                    node.onRemoved = function() {
                        if (appInstance.HubNodesService) {
                            appInstance.HubNodesService.notifyHubRemoved(this);
                        } else {
                            console.error(`     HubNodesService not found! Cannot notify removal.`);
                        }
                        if (originalOnRemoved) {
                            originalOnRemoved.apply(this, arguments);
                        }
                    };
                    node.onRemoved.__isNotifierOverridden = true;
                } catch (error) {
                    console.error(`[${TARGET_NODE_TYPE} Notifier] Error overriding onRemoved:`, error);
                }
            }
            return true;
        },
        async nodeCreated(node) {},
        async onNodeAdded(node) {},
        async loadedGraphNode(node, appInstance) {
            if (!node) return;
            if (node.type === TARGET_NODE_TYPE) {
                this.setupNodeMonitoring(node, appInstance);
            }
        }
    });
})();

console.log(`[${NODE_TITLE}] JS file loaded`);
console.log("[MultiModel] ✅ Завантажено active_model.js, HubNodesService буде доступний після ініціалізації."); 