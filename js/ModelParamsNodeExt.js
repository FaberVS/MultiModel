// js/ModelParamsNodeExt.js
// Розширення для ModelParamsPipeNode, щоб він повідомляв про свої зміни

import { app } from "/scripts/app.js";

const TARGET_NODE_TYPE = "ModelParamsPipe"; // Цільовий тип вузла, який ми розширюємо

console.log("%c[ModelParamsNodeExt] JS файл завантажився! (v2-dynamic-inputs)", "color: white; background: #007acc; font-weight: bold; padding: 2px 8px; border-radius: 3px;");
// --- Loading js/ModelParamsNodeExt.js --- v2-dynamic-inputs

console.log(`--- Loading extension for ${TARGET_NODE_TYPE} ---`);

app.registerExtension({
    name: "MultiModel.ModelParamsPipeNode.Notifier",

    // Додатковий трекінг для діагностики
    newNodesDetected: false,

    // Додаємо базову ініціалізацію та прямий пошук вузлів
    async setup() {
        console.log(`[${TARGET_NODE_TYPE} Notifier] SETUP starting...`);
        
        // Перевіряємо наявність сервісу одразу
        if (app.HubNodesService) {
            console.log(`[${TARGET_NODE_TYPE} Notifier] HubNodesService found during setup`);
        } else {
            console.error(`[${TARGET_NODE_TYPE} Notifier] HubNodesService NOT found during setup!`);
        }

        // Зачекаємо, доки граф буде завантажено, і потім проскануємо його
        const checkForGraph = () => {
            if (app.graph) {
                console.log(`[${TARGET_NODE_TYPE} Notifier] Graph found in setup`);
                
                // Додаємо обробник зміни графу
                if (app.graph.onNodeAdded && !app.graph._notifier_attached) {
                    const origNodeAdded = app.graph.onNodeAdded;
                    
                    app.graph.onNodeAdded = function(node) {
                        console.log(`[${TARGET_NODE_TYPE} Notifier] Graph onNodeAdded called for node ID: ${node.id}, type: ${node.type}`);
                        
                        if (origNodeAdded) {
                            origNodeAdded.call(this, node);
                        }
                        
                        // Перевіряємо, чи це наш цільовий тип
                        if (node.type === TARGET_NODE_TYPE) {
                            console.log(`[${TARGET_NODE_TYPE} Notifier] Target node added to graph: ID ${node.id}`);
                            
                            // Викликаємо наш обробник
                            const extension = app.extensions.find(ext => ext.name === "MultiModel.ModelParamsPipeNode.Notifier");
                            if (extension) {
                                extension.setupNodeMonitoring(node);
                                
                                if (app.HubNodesService) {
                                    console.log(`[${TARGET_NODE_TYPE} Notifier] Notifying service about new graph node: ID ${node.id}`);
                                    app.HubNodesService.notifyHubAdded(node);
                                    
                                    // Пробуємо різні методи оновлення інтерфейсу
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
                    console.log(`[${TARGET_NODE_TYPE} Notifier] Attached graph.onNodeAdded handler`);
                }
                
                // Зробимо сканування графу з невеликою затримкою для певності
                setTimeout(() => {
                    if (!app.graph || !app.graph._nodes) {
                        console.log(`[${TARGET_NODE_TYPE} Notifier] No graph nodes found yet`);
                        return;
                    }
                    
                    const targetNodes = app.graph._nodes.filter(node => node.type === TARGET_NODE_TYPE);
                    console.log(`[${TARGET_NODE_TYPE} Notifier] Initial graph scan found ${targetNodes.length} target nodes`);
                    
                    const extension = app.extensions.find(ext => ext.name === "MultiModel.ModelParamsPipeNode.Notifier");
                    if (!extension) {
                        console.error(`[${TARGET_NODE_TYPE} Notifier] Extension not found in array!`);
                        return;
                    }
                    
                    // Обробляємо знайдені вузли
                    for (const node of targetNodes) {
                        extension.setupNodeMonitoring(node);
                        
                        // Якщо знайшли хоча б один вузол, спробуємо оновити інтерфейс
                        if (app.HubNodesService) {
                            console.log(`[${TARGET_NODE_TYPE} Notifier] Found existing node in scan: ID ${node.id}`);
                        }
                    }
                    
                    // Якщо було знайдено вузли, форсуємо оновлення
                    if (targetNodes.length > 0 && app.HubNodesService) {
                        console.log(`[${TARGET_NODE_TYPE} Notifier] Forcing update after scan found ${targetNodes.length} nodes`);
                        
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
                console.log(`[${TARGET_NODE_TYPE} Notifier] Graph not available yet, will retry...`);
                setTimeout(checkForGraph, 500);
            }
        };
        
        // Запускаємо перевірку графу
        checkForGraph();
        
        console.log(`[${TARGET_NODE_TYPE} Notifier] SETUP completed`);
    },

    // Встановлення моніторингу title/видалення для вузла
    setupNodeMonitoring(node, appInstance = app) {
        if (!node) return false;
        console.log(`[${TARGET_NODE_TYPE} Notifier] Setting up monitoring for node ID: ${node.id}`);
        
        // --- Встановлюємо моніторинг title ---
        if (!node.__title_monitored) {
            console.log(`[${TARGET_NODE_TYPE} Notifier] Setting up title monitoring for node ID: ${node.id}`);
            
            try {
                const originalTitle = node.title;
                
                // Зберігаємо оригінальне значення
                Object.defineProperty(node, '_monitored_title', {
                    value: originalTitle,
                    writable: true
                });

                // Перевизначаємо геттер/сеттер для title
                Object.defineProperty(node, 'title', {
                    get: function() {
                        return this._monitored_title;
                    },
                    set: function(newTitle) {
                        console.log(`---> [${TARGET_NODE_TYPE} Notifier] title property CHANGED: "${this._monitored_title}" → "${newTitle}" for node ID: ${this.id}`);
                        
                        // Якщо значення не змінилось, не виконуємо додаткові дії
                        if (this._monitored_title === newTitle) {
                            console.log(`     Title not changed (same value), skipping notification.`);
                            return;
                        }
                        
                        // Зберігаємо нове значення
                        this._monitored_title = newTitle;
                        
                        // Повідомляємо сервіс про перейменування з невеликою затримкою
                        setTimeout(() => {
                            if (appInstance.HubNodesService) {
                                console.log(`     Notifying service about rename for node ID: ${this.id}`);
                                appInstance.HubNodesService.notifyHubRenamed(this);
                            } else {
                                console.error(`     HubNodesService not found! Cannot notify rename.`);
                            }
                        }, 0);
                    },
                    enumerable: true,
                    configurable: true
                });
                
                node.__title_monitored = true;
                console.log(`[${TARGET_NODE_TYPE} Notifier] Title property monitored for node ID: ${node.id}`);
            } catch (error) {
                console.error(`[${TARGET_NODE_TYPE} Notifier] Error setting up title monitoring:`, error);
            }
        }

        // --- Встановлюємо перехоплення видалення ---
        if (!node.onRemoved || !node.onRemoved.__isNotifierOverridden) {
            try {
                const originalOnRemoved = node.onRemoved;
                
                node.onRemoved = function() {
                    console.log(`[${TARGET_NODE_TYPE} Notifier] Node removed: ID ${this.id}`);
                    
                    // Повідомляємо сервіс про видалення
                    if (appInstance.HubNodesService) {
                        console.log(`     Notifying service about removal for node ID: ${this.id}`);
                        appInstance.HubNodesService.notifyHubRemoved(this);
                    } else {
                        console.error(`     HubNodesService not found! Cannot notify removal.`);
                    }
                    
                    // Викликаємо оригінальний метод, якщо він існує
                    if (originalOnRemoved) {
                        originalOnRemoved.apply(this, arguments);
                    }
                };
                
                node.onRemoved.__isNotifierOverridden = true;
                console.log(`[${TARGET_NODE_TYPE} Notifier] onRemoved overridden for node ID: ${node.id}`);
            } catch (error) {
                console.error(`[${TARGET_NODE_TYPE} Notifier] Error overriding onRemoved:`, error);
            }
        }
        
        return true;
    },

    // Для логування проблемних випадків
    async nodeCreated(node) {
        console.log(`[${TARGET_NODE_TYPE} Notifier] nodeCreated called for node type: ${node ? node.type : 'undefined'}, ID: ${node ? node.id : 'undefined'}`);
    },
    
    // Для логування проблемних випадків
    async onNodeAdded(node) {
        console.log(`[${TARGET_NODE_TYPE} Notifier] onNodeAdded called for node type: ${node ? node.type : 'undefined'}, ID: ${node ? node.id : 'undefined'}`);
    },
    
    // Хук для обробки вузлів, що вже існують при завантаженні
    async loadedGraphNode(node, appInstance) {
        if (!node) return;
        console.log(`[${TARGET_NODE_TYPE} Notifier] loadedGraphNode called for node type: ${node.type}, ID: ${node.id}`);
        
        if (node.type === TARGET_NODE_TYPE) {
            // Встановлюємо моніторинг для існуючого вузла
            this.setupNodeMonitoring(node, appInstance);
        }
    }
});

console.log(`--- Extension for ${TARGET_NODE_TYPE} loaded ---`); 