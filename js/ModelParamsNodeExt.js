// js/ModelParamsNodeExt.js
// Розширення для ModelParamsPipeNode, щоб він повідомляв про свої зміни

import { app } from "/scripts/app.js";

const TARGET_NODE_TYPE = "ModelParamsPipe"; // Цільовий тип вузла, який ми розширюємо

// --- Loading js/ModelParamsNodeExt.js --- v2-dynamic-inputs

app.registerExtension({
    name: "MultiModel.ModelParamsPipeNode.Notifier",

    // Додатковий трекінг для діагностики
    newNodesDetected: false,

    // Додаємо базову ініціалізацію та прямий пошук вузлів
    async setup() {
        // Перевіряємо наявність сервісу одразу
        if (app.HubNodesService) {
        } else {
            console.error(`[${TARGET_NODE_TYPE} Notifier] HubNodesService NOT found during setup!`);
        }

        // Зачекаємо, доки граф буде завантажено, і потім проскануємо його
        const checkForGraph = () => {
            if (app.graph) {
                // Додаємо обробник зміни графу
                if (app.graph.onNodeAdded && !app.graph._notifier_attached) {
                    const origNodeAdded = app.graph.onNodeAdded;
                    
                    app.graph.onNodeAdded = function(node) {
                        if (origNodeAdded) {
                            origNodeAdded.call(this, node);
                        }
                        
                        // Перевіряємо, чи це наш цільовий тип
                        if (node.type === TARGET_NODE_TYPE) {
                            // Викликаємо наш обробник
                            const extension = app.extensions.find(ext => ext.name === "MultiModel.ModelParamsPipeNode.Notifier");
                            if (extension) {
                                extension.setupNodeMonitoring(node);
                                
                                if (app.HubNodesService) {
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
                }
                
                // Зробимо сканування графу з невеликою затримкою для певності
                setTimeout(() => {
                    if (!app.graph || !app.graph._nodes) {
                        return;
                    }
                    
                    const targetNodes = app.graph._nodes.filter(node => node.type === TARGET_NODE_TYPE);
                    
                    const extension = app.extensions.find(ext => ext.name === "MultiModel.ModelParamsPipeNode.Notifier");
                    if (!extension) {
                        return;
                    }
                    
                    // Обробляємо знайдені вузли
                    for (const node of targetNodes) {
                        extension.setupNodeMonitoring(node);
                        
                        // Якщо знайшли хоча б один вузол, спробуємо оновити інтерфейс
                        if (app.HubNodesService) {
                        }
                    }
                    
                    // Якщо було знайдено вузли, форсуємо оновлення
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
        
        // Запускаємо перевірку графу
        checkForGraph();
    },

    // Встановлення моніторингу title/видалення для вузла
    setupNodeMonitoring(node, appInstance = app) {
        if (!node) return false;
        
        // --- Встановлюємо моніторинг title ---
        if (!node.__title_monitored) {
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
                        // Якщо значення не змінилось, не виконуємо додаткові дії
                        if (this._monitored_title === newTitle) {
                            return;
                        }
                        
                        // Зберігаємо нове значення
                        this._monitored_title = newTitle;
                        
                        // Повідомляємо сервіс про перейменування з невеликою затримкою
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
                
                node.__title_monitored = true;
            } catch (error) {
                console.error(`[${TARGET_NODE_TYPE} Notifier] Error setting up title monitoring:`, error);
            }
        }

        // --- Встановлюємо перехоплення видалення ---
        if (!node.onRemoved || !node.onRemoved.__isNotifierOverridden) {
            try {
                const originalOnRemoved = node.onRemoved;
                
                node.onRemoved = function() {
                    // Повідомляємо сервіс про видалення
                    if (appInstance.HubNodesService) {
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
            } catch (error) {
                console.error(`[${TARGET_NODE_TYPE} Notifier] Error overriding onRemoved:`, error);
            }
        }
        
        return true;
    },

    // Для логування проблемних випадків
    async nodeCreated(node) {
    },
    
    // Для логування проблемних випадків
    async onNodeAdded(node) {
    },
    
    // Хук для обробки вузлів, що вже існують при завантаженні
    async loadedGraphNode(node, appInstance) {
        if (!node) return;
        
        if (node.type === TARGET_NODE_TYPE) {
            // Встановлюємо моніторинг для існуючого вузла
            this.setupNodeMonitoring(node, appInstance);
        }
    }
}); 