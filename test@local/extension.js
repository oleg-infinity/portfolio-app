import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export default class MyExtension {
    constructor() {
        this._button = null;
        this._window = null;
        this._searchWindow = null;
        this._isWindowVisible = false;
        this._isSearchVisible = false;
        this._assetsData = [];
        this._searchField = null;
        this._dataFile = null;
    }

    enable() {
        this._initDataStorage();
        this._loadAssetsData();
        this._button = new PanelMenu.Button(30.0, 'MyExtension', false);
        this._button.add_style_class_name('myextension-button');
        this._portfolioIcon = new St.Icon({
            icon_name: 'folder-symbolic',
            style_class: 'system-status-icon portfolio-icon'
        });
        this._button.add_child(this._portfolioIcon);
        this._button.connect('button-press-event', (actor, event) => {
            this._togglePortfolioWindow();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea('test', this._button, 30, 'left');
    }

    _initDataStorage() {
        try {
            const userDataDir = GLib.get_user_data_dir();
            const extensionDataDir = `${userDataDir}/gnome-shell/extensions/test@local`;
            
            const userConfigDir = GLib.get_user_config_dir();
            const configDataDir = `${userConfigDir}/test-portfolio`;
            
            let dataDir;
            if (GLib.file_test(extensionDataDir, GLib.FileTest.EXISTS)) {
                dataDir = extensionDataDir;
            } else {
                dataDir = configDataDir;
            }
            
            if (!GLib.file_test(dataDir, GLib.FileTest.EXISTS)) {
                GLib.mkdir_with_parents(dataDir, 0o755);
                log(`Створено директорію для даних: ${dataDir}`);
            }
            
            this._dataFile = `${dataDir}/portfolio.json`;
            log(`Файл даних: ${this._dataFile}`);
            
        } catch (e) {
            log(`Помилка ініціалізації сховища: ${e}`);
            const homeDir = GLib.get_home_dir();
            this._dataFile = `${homeDir}/.test-portfolio.json`;
        }
    }

    _loadAssetsData() {
        try {
            if (GLib.file_test(this._dataFile, GLib.FileTest.EXISTS)) {
                const [success, contents] = GLib.file_get_contents(this._dataFile);
                if (success) {
                    const decoder = new TextDecoder('utf-8');
                    const jsonString = decoder.decode(contents);
                    const data = JSON.parse(jsonString);
                    this._assetsData = data.assets || [];
                    
                    // Виправляємо старі дані, якщо немає поля purchasePrice
                    this._assetsData.forEach(asset => {
                        if (asset.purchasePrice === undefined) {
                            asset.purchasePrice = asset.price || 0;
                            log(`Виправлено актив ${asset.symbol}: додано purchasePrice = ${asset.purchasePrice}`);
                        }
                    });
                    
                    log(`Завантажено ${this._assetsData.length} активів`);
                }
            } else {
                this._assetsData = [];
                this._saveAssetsData();
                log('Створено новий порожній портфель');
            }
        } catch (e) {
            log(`Помилка завантаження даних: ${e}`);
            this._assetsData = [];
        }
    }

    _saveAssetsData() {
        try {
            const data = {
                version: '1.1', // Оновлюємо версію
                lastUpdate: new Date().toISOString(),
                assets: this._assetsData
            };
            
            const encoder = new TextEncoder();
            const jsonString = JSON.stringify(data, null, 2);
            const bytes = encoder.encode(jsonString);
            
            GLib.file_set_contents(this._dataFile, bytes);
            log(`Збережено ${this._assetsData.length} активів`);
        } catch (e) {
            log(`Помилка збереження даних: ${e}`);
        }
    }

    _searchAsset(symbol) {
        return new Promise((resolve, reject) => {
            if (!symbol) return resolve(null);

            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d`;
        
            try {
                const file = Gio.File.new_for_uri(url);
                const cancellable = new Gio.Cancellable();
            
                file.load_contents_async(cancellable, (file, result) => {
                    try {
                        const [success, contents] = file.load_contents_finish(result);
                    
                        if (!success) {
                            resolve(null);
                            return;
                        }
                    
                        const decoder = new TextDecoder('utf-8');
                        const responseText = decoder.decode(contents);
                        const json = JSON.parse(responseText);
                    
                        if (json.chart && json.chart.result && json.chart.result[0]) {
                            const result = json.chart.result[0];
                            const meta = result.meta;
                            const price = meta.regularMarketPrice;
                        
                            if (price) {
                                resolve({
                                    symbol: meta.symbol,
                                    price: price,
                                    currentPrice: price,
                                    name: meta.shortName || meta.symbol,
                                    purchasePrice: price // Додаємо початкове значення
                                });
                            } else {
                                resolve(null);
                            }
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        log(`Помилка при парсингу: ${e}`);
                        resolve(null);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    _togglePortfolioWindow() {
        if (this._isWindowVisible) {
            this._hidePortfolioWindow();
        } else {
            this._showPortfolioWindow();
        }
    }

    _showPortfolioWindow() {
        if (!this._window) {
            this._createPortfolioWindow();
        }
        Main.layoutManager.addChrome(this._window);
        this._isWindowVisible = true;
        this._portfolioIcon.icon_name = 'folder-open-symbolic';
        this._updatePortfolioData();
        this._window.show();
    }

    _hidePortfolioWindow() {
        if (this._window && this._isWindowVisible) {
            this._window.hide();
            Main.layoutManager.removeChrome(this._window);
            this._isWindowVisible = false;
            this._portfolioIcon.icon_name = 'folder-symbolic';
        }
    }

    _createPortfolioWindow() {
        this._window = new St.Widget({
            style_class: 'portfolio-window',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: 450,
            height: 750
        });

        const mainContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-container',
            x_expand: true,
            y_expand: true
        });

        const header = new St.BoxLayout({
            style_class: 'portfolio-header'
        });

        const titleContainer = new St.BoxLayout({
            style_class: 'title-container',
            x_expand: true
        });
    
        const title = new St.Label({
            text: 'My Portfolio',
            style_class: 'portfolio-title'
        });
        titleContainer.add_child(title);

        const searchContainer = new St.BoxLayout({
            style_class: 'search-container'
        });

        const searchButton = new St.Button({
            child: new St.Icon({ 
                icon_name: 'edit-find-symbolic',
                style_class: 'search-icon'
            }),
            style_class: 'search-button'
        });
        searchContainer.add_child(searchButton);
        searchButton.connect('clicked', () => {
            this._showSearchWindow();
        });
        header.add_child(titleContainer);
        header.add_child(searchContainer);

        const horizontalLine = new St.BoxLayout({
            style_class: 'horizontal-line'
        });

        // Основний контент - тільки таблиця активів
        const contentArea = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-content',
            x_expand: true,
            y_expand: true
        });

        const assetsColumn = new St.BoxLayout({
            vertical: true,
            style_class: 'assets-column',
            x_expand: true,
            y_expand: true
        });

        const assetsHeader = new St.BoxLayout({
            style_class: 'assets-header'
        });
    
        assetsHeader.add_child(new St.Label({
            text: 'TAG',
            style_class: 'assets-header-label asset-name'
        }));
    
        assetsHeader.add_child(new St.Label({
            text: 'PRICE',
            style_class: 'assets-header-label asset-price'
        }));
    
        assetsHeader.add_child(new St.Label({
            text: 'BOUGHT',
            style_class: 'assets-header-label asset-purchase-price'
        }));
    
        assetsHeader.add_child(new St.Label({
            text: 'QUANTITY',
            style_class: 'assets-header-label asset-quantity'
        }));
    
        assetsHeader.add_child(new St.Label({
            text: 'INCOME',
            style_class: 'assets-header-label asset-profitability'
        }));

        assetsColumn.add_child(assetsHeader);

        this._assetsContainer = new St.BoxLayout({
             vertical: true,
            style_class: 'assets-container',
            x_expand: true,
            y_expand: true
        });
    
        assetsColumn.add_child(this._assetsContainer);
        contentArea.add_child(assetsColumn);

        // Нижня частина - статистика та діаграма
        const bottomSection = new St.BoxLayout({
            style_class: 'portfolio-bottom-section'
        });

        // Ліва частина - статистика
        const statsContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'stats-container',
            x_expand: true,
            y_expand: true
        });

        this._totalValueLabel = new St.Label({
            text: 'Загальна вартість: $0.00',
            style_class: 'total-value'
        });
        statsContainer.add_child(this._totalValueLabel);

        this._totalProfitLabel = new St.Label({
            text: 'Загальна дохідність: 0.00%',
            style_class: 'total-profit'
        });
        statsContainer.add_child(this._totalProfitLabel);

        this._totalInvestmentLabel = new St.Label({
            text: 'Загальні інвестиції: $0.00',
            style_class: 'total-investment'
        });
        statsContainer.add_child(this._totalInvestmentLabel);

        // Права частина - діаграма та легенда
        const chartContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'chart-container'
        });

        this._chartArea = new St.DrawingArea({
            style_class: 'chart-area',
            width: 180,
            height: 180
        });
    
        this._chartArea.connect('repaint', (area) => {
            this._drawChart(area);
        });

        chartContainer.add_child(this._chartArea);

        this._chartLegend = new St.BoxLayout({
            vertical: true,
            style_class: 'chart-legend'
        });
        chartContainer.add_child(this._chartLegend);

        bottomSection.add_child(statsContainer);
        bottomSection.add_child(chartContainer);
        mainContainer.add_child(header);
        mainContainer.add_child(horizontalLine);
        mainContainer.add_child(contentArea);
        mainContainer.add_child(bottomSection);
        this._window.add_child(mainContainer);
        this._repositionWindow();
    
        this._window.connect('button-press-event', (actor, event) => {
            return Clutter.EVENT_STOP;
        });

        this._window.connect('key-press-event', (actor, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Escape) {
                this._hidePortfolioWindow();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _repositionWindow() {
        if (!this._window || !this._button) return;
        try {
            const [buttonX, buttonY] = this._button.get_transformed_position();
            const panelHeight = Main.panel.height;
            const monitor = Main.layoutManager.primaryMonitor;
            const x = Math.min(buttonX, monitor.width - 550);
            const y = buttonY + panelHeight + 10;
            this._window.set_position(x, y);
        } catch (error) {
            console.error('Помилка позиціонування вікна:', error);
            this._window.set_position(120, 100);
        }
    }

    _showSearchWindow() {
        if (this._searchWindow) {
            this._hideSearchWindow();
            return;
        }

        this._searchWindow = new St.Widget({
            style_class: 'search-window',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: 350,
            height: 200
        });

        const searchContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'search-container'
        });

        const header = new St.BoxLayout({
            style_class: 'search-header'
        });
        
        const title = new St.Label({
            text: 'Пошук активу',
            style_class: 'search-title'
        });
        header.add_child(title);

        const closeButton = new St.Button({
            child: new St.Icon({ icon_name: 'window-close-symbolic' }),
            style_class: 'close-button'
        });
        closeButton.connect('clicked', () => {
            this._hideSearchWindow();
        });
        header.add_child(closeButton);

        const content = new St.BoxLayout({
            vertical: true,
            style_class: 'search-content'
        });

        const entryContainer = new St.BoxLayout({
            style_class: 'entry-container'
        });
        const entry = new St.Entry({
            hint_text: 'Введіть символ (наприклад: AAPL)',
            x_expand: true,
            style_class: 'search-entry'
        });
        entryContainer.add_child(entry);

        const buttonContainer = new St.BoxLayout({
            style_class: 'button-container'
        });
        const searchBtn = new St.Button({
            label: 'Знайти',
            style_class: 'search-action-button'
        });

        searchBtn.connect('clicked', () => {
            this._performSearch(entry, searchBtn);
        });

        buttonContainer.add_child(searchBtn);

        entry.connect('key-press-event', (actor, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                this._performSearch(entry, searchBtn);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        content.add_child(entryContainer);
        content.add_child(buttonContainer);

        searchContainer.add_child(header);
        searchContainer.add_child(content);
        this._searchWindow.add_child(searchContainer);

        this._repositionSearchWindow();
        
        Main.layoutManager.addChrome(this._searchWindow);
        this._searchWindow.show();
        this._isSearchVisible = true;
        
        entry.grab_key_focus();
    }

    async _performSearch(entry, searchBtn) {
        const symbol = entry.text.trim().toUpperCase();
        if (!symbol) {
            Main.notify('Будь ласка, введіть символ активу');
            return;
        }

        searchBtn.label = 'Пошук...';
        searchBtn.set_reactive(false);

        try {
            const asset = await this._searchAsset(symbol);
            
            if (asset) {
                this._askForPurchaseDetails(asset);
                this._hideSearchWindow();
            } else {
                Main.notify(`Актив "${symbol}" не знайдено`);
            }
        } catch (error) {
            log(`Помилка пошуку: ${error}`);
            Main.notify('Помилка пошуку. Перевірте підключення до інтернету');
        } finally {
            searchBtn.label = 'Знайти';
            searchBtn.set_reactive(true);
        }
    }

    _askForPurchaseDetails(asset) {
        const dialog = new St.Widget({
            style_class: 'purchase-dialog',
            reactive: true,
            can_focus: true,
            width: 300,
            height: 200
        });

        const container = new St.BoxLayout({
            vertical: true,
            style_class: 'purchase-container'
        });

        const message = new St.Label({
            text: `Додавання ${asset.symbol}`,
            style_class: 'purchase-message'
        });

        // Поле для кількості
        const quantityContainer = new St.BoxLayout({
            style_class: 'purchase-field-container'
        });
        quantityContainer.add_child(new St.Label({
            text: 'Кількість:',
            style_class: 'purchase-label'
        }));
        const quantityEntry = new St.Entry({
            text: '1',
            style_class: 'purchase-entry'
        });
        quantityContainer.add_child(quantityEntry);

        // Поле для ціни придбання
        const priceContainer = new St.BoxLayout({
            style_class: 'purchase-field-container'
        });
        priceContainer.add_child(new St.Label({
            text: 'Ціна придбання:',
            style_class: 'purchase-label'
        }));
        const priceEntry = new St.Entry({
            text: asset.price.toFixed(2),
            style_class: 'purchase-entry'
        });
        priceContainer.add_child(priceEntry);

        const buttonContainer = new St.BoxLayout({
            style_class: 'purchase-buttons'
        });

        const addButton = new St.Button({
            label: 'Додати',
            style_class: 'purchase-add-button'
        });

        const cancelButton = new St.Button({
            label: 'Скасувати',
            style_class: 'purchase-cancel-button'
        });

        addButton.connect('clicked', () => {
            const quantity = parseInt(quantityEntry.text) || 1;
            const purchasePrice = parseFloat(priceEntry.text) || asset.price;
            
            if (quantity > 0 && purchasePrice > 0) {
                // Створюємо новий об'єкт активу з усіма необхідними полями
                const newAsset = {
                    symbol: asset.symbol,
                    price: asset.price,
                    currentPrice: asset.price,
                    purchasePrice: purchasePrice,
                    quantity: quantity,
                    name: asset.name,
                    color: this._getRandomColor()
                };
                
                // Перевіряємо, чи актив вже є в портфелі
                const existingIndex = this._assetsData.findIndex(a => a.symbol === asset.symbol);
                if (existingIndex >= 0) {
                    // Якщо актив вже є, оновлюємо кількість та середню ціну придбання
                    const existingAsset = this._assetsData[existingIndex];
                    const totalQuantity = existingAsset.quantity + quantity;
                    const averagePrice = ((existingAsset.purchasePrice * existingAsset.quantity) + 
                                        (purchasePrice * quantity)) / totalQuantity;
                    
                    existingAsset.quantity = totalQuantity;
                    existingAsset.purchasePrice = averagePrice;
                    log(`Оновлено існуючий актив: ${asset.symbol}`);
                } else {
                    this._assetsData.push(newAsset);
                    log(`Додано новий актив: ${asset.symbol}`);
                }
                
                this._updatePortfolioData();
                this._saveAssetsData();
                Main.layoutManager.removeChrome(dialog);
                Main.notify(`Додано ${quantity} ${asset.symbol}`);
            } else {
                Main.notify('Будь ласка, введіть коректні значення');
            }
        });

        cancelButton.connect('clicked', () => {
            Main.layoutManager.removeChrome(dialog);
        });

        // Обробка Enter
        const handleEnter = (actor, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                addButton.emit('clicked');
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        };

        quantityEntry.connect('key-press-event', handleEnter);
        priceEntry.connect('key-press-event', handleEnter);

        buttonContainer.add_child(addButton);
        buttonContainer.add_child(cancelButton);

        container.add_child(message);
        container.add_child(quantityContainer);
        container.add_child(priceContainer);
        container.add_child(buttonContainer);
        dialog.add_child(container);

        // Позиціонування по центру
        const monitor = Main.layoutManager.primaryMonitor;
        dialog.set_position(
            Math.floor((monitor.width - 300) / 2),
            Math.floor((monitor.height - 200) / 2)
        );

        Main.layoutManager.addChrome(dialog);
        dialog.show();
        quantityEntry.grab_key_focus();
        quantityEntry.set_selection(0, -1);
    }

    _repositionSearchWindow() {
        if (!this._searchWindow || !this._window) return;
        
        try {
            const [windowX, windowY] = this._window.get_position();
            const windowWidth = this._window.width;
            const monitor = Main.layoutManager.primaryMonitor;
            
            const x = Math.min(windowX + windowWidth + 10, monitor.width - 350);
            const y = windowY;
            
            this._searchWindow.set_position(x, y);
        } catch (error) {
            console.error('Помилка позиціонування вікна пошуку:', error);
            const [buttonX, buttonY] = this._button.get_transformed_position();
            const panelHeight = Main.panel.height;
            this._searchWindow.set_position(buttonX, buttonY + panelHeight + 10);
        }
    }

    _hideSearchWindow() {
        if (this._searchWindow && this._isSearchVisible) {
            this._searchWindow.destroy();
            this._searchWindow = null;
            this._isSearchVisible = false;
        }
    }

    _getRandomColor() {
        const colors = ['#ffa0a0ff', '#acfff9ff', '#b8ffa7ff', '#9bffbcff', '#FFE66D', '#FFA07A', '#98D8C8', '#F7DC6F'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    _calculateProfitability(currentPrice, purchasePrice) {
        if (!purchasePrice || purchasePrice === 0) return 0;
        return ((currentPrice - purchasePrice) / purchasePrice) * 100;
    }

    _updatePortfolioData() {
        if (!this._assetsContainer) return;
    
        this._assetsContainer.destroy_all_children();
        if (this._chartLegend) {
            this._chartLegend.destroy_all_children();
        }
    
        let totalValue = 0;
        let totalInvestment = 0;
        let totalProfit = 0;
    
        // Спочатку перевіряємо дані
        log(`Оновлення портфеля: ${this._assetsData.length} активів`);
        this._assetsData.forEach(asset => {
            // Гарантуємо, що всі обов'язкові поля існують
            if (!asset.purchasePrice) asset.purchasePrice = asset.price || 0;
            if (!asset.quantity) asset.quantity = 1;
        
            const assetValue = asset.price * asset.quantity;
            const assetInvestment = asset.purchasePrice * asset.quantity;
            const assetProfit = assetValue - assetInvestment;
        
            totalValue += assetValue;
            totalInvestment += assetInvestment;
            totalProfit += assetProfit;
        });
    
        const totalProfitability = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;
    
        this._assetsData.forEach((asset, index) => {
            const assetValue = asset.price * asset.quantity;
            const percentage = totalValue > 0 ? (assetValue / totalValue * 100) : 0;
            const profitability = this._calculateProfitability(asset.price, asset.purchasePrice);
        
            const assetRow = new St.BoxLayout({
                style_class: "asset-row"
            });
        
            // Символ
            assetRow.add_child(new St.Label({
                text: asset.symbol,
                style_class: 'row-symbol'
            }));
        
            // Поточна ціна
            assetRow.add_child(new St.Label({
                text: `$${asset.price.toFixed(2)}`,
                style_class: 'row-price'
            }));

            // Ціна придбання
            assetRow.add_child(new St.Label({
                text: `$${asset.purchasePrice.toFixed(2)}`,
                style_class: 'row-purchase-price'
            }));

            // Кількість та кнопка редагування
            const quantityContainer = new St.BoxLayout({
                style_class: 'quantity-container'
            });
        
            quantityContainer.add_child(new St.Label({
                text: asset.quantity.toString(),
                style_class: 'row-quantity'
            }));

            assetRow.add_child(quantityContainer);
        
            // Дохідність
            const profitabilityColor = profitability >= 0 ? 'profit-positive' : 'profit-negative';
            assetRow.add_child(new St.Label({
                text: `${profitability.toFixed(2)}%`,
                style_class: `row-profitability ${profitabilityColor}`
            }));

            const editButtonContainer = new St.BoxLayout({
                style_class: 'edit-container'
            })

            const editButton = new St.Button({
                child: new St.Icon({ 
                    icon_name: 'document-edit-symbolic',
                    style_class: 'edit-icon'
                }),
                style_class: 'edit-button',
                reactive: true,
                can_focus: true,
                track_hover: true
            });

            editButton.connect('clicked', () => {
                this._editAsset(index);
            });

            editButtonContainer.add_child(editButton)
            assetRow.add_child(editButtonContainer)
        
            this._assetsContainer.add_child(assetRow);
        
            if (this._chartLegend) {
                const legendItem = new St.BoxLayout({
                    style_class: 'legend-item'
                });
            
                const colorBox = new St.Widget({
                    style: `background-color: ${asset.color || '#73fc03ff'}; width: 12px; height: 12px; border-radius: 2px;`
                });
            
                const legendLabel = new St.Label({
                    text: `${asset.symbol} (${percentage.toFixed(1)}%)`,
                    style_class: 'legend-label'
                });
            
                legendItem.add_child(colorBox);
                legendItem.add_child(legendLabel);
                this._chartLegend.add_child(legendItem);
            }
        });
    
        // Оновлюємо статистику
        if (this._totalValueLabel) {
            this._totalValueLabel.set_text(`Загальна вартість: $${totalValue.toFixed(2)}`);
        }
    
        if (this._totalProfitLabel) {
            const profitColor = totalProfitability >= 0 ? 'profit-positive' : 'profit-negative';
            this._totalProfitLabel.set_text(`Загальна дохідність: ${totalProfitability.toFixed(2)}%`);
            this._totalProfitLabel.style_class = `total-profit ${profitColor}`;
        }
    
        if (this._totalInvestmentLabel) {
            this._totalInvestmentLabel.set_text(`Загальні інвестиції: $${totalInvestment.toFixed(2)}`);
        }
    
        if (this._chartArea) {
            this._chartArea.queue_repaint();
        }
    }

    _editAsset(index) {
        if (index < 0 || index >= this._assetsData.length) return;
        
        const asset = this._assetsData[index];
        const dialog = new St.Widget({
            style_class: 'edit-dialog',
            reactive: true,
            can_focus: true,
            width: 300,
            height: 200
        });

        const container = new St.BoxLayout({
            vertical: true,
            style_class: 'edit-container'
        });

        const header = new St.BoxLayout({
            style_class: 'edit-header'
        });
        
        header.add_child(new St.Label({
            text: `Редагування ${asset.symbol}`,
            style_class: 'edit-title'
        }));

        const content = new St.BoxLayout({
            vertical: true,
            style_class: 'edit-content'
        });

        // Поле для кількості
        const quantityContainer = new St.BoxLayout({
            style_class: 'edit-field-container'
        });
        quantityContainer.add_child(new St.Label({
            text: 'Кількість:',
            style_class: 'edit-label'
        }));
        const quantityEntry = new St.Entry({
            text: asset.quantity.toString(),
            style_class: 'edit-entry'
        });
        quantityContainer.add_child(quantityEntry);

        // Поле для ціни придбання
        const priceContainer = new St.BoxLayout({
            style_class: 'edit-field-container'
        });
        priceContainer.add_child(new St.Label({
            text: 'Ціна придбання:',
            style_class: 'edit-label'
        }));
        const priceEntry = new St.Entry({
            text: asset.purchasePrice.toFixed(2),
            style_class: 'edit-entry'
        });
        priceContainer.add_child(priceEntry);

        const buttonContainer = new St.BoxLayout({
            style_class: 'edit-buttons'
        });

        const saveButton = new St.Button({
            label: 'Зберегти',
            style_class: 'edit-save-button'
        });

        const deleteButton = new St.Button({
            label: 'Видалити',
            style_class: 'edit-delete-button'
        });

        const cancelButton = new St.Button({
            label: 'Скасувати',
            style_class: 'edit-cancel-button'
        });

        saveButton.connect('clicked', () => {
            const newQuantity = parseInt(quantityEntry.text) || 1;
            const newPurchasePrice = parseFloat(priceEntry.text) || asset.purchasePrice;
            
            if (newQuantity > 0 && newPurchasePrice > 0) {
                asset.quantity = newQuantity;
                asset.purchasePrice = newPurchasePrice;
                this._updatePortfolioData();
                this._saveAssetsData();
                Main.layoutManager.removeChrome(dialog);
                Main.notify(`Оновлено ${asset.symbol}`);
            } else {
                Main.notify('Будь ласка, введіть коректні значення');
            }
        });

        deleteButton.connect('clicked', () => {
            this._assetsData.splice(index, 1);
            this._updatePortfolioData();
            this._saveAssetsData();
            Main.layoutManager.removeChrome(dialog);
            Main.notify(`Видалено ${asset.symbol}`);
        });

        cancelButton.connect('clicked', () => {
            Main.layoutManager.removeChrome(dialog);
        });

        buttonContainer.add_child(saveButton);
        buttonContainer.add_child(deleteButton);
        buttonContainer.add_child(cancelButton);

        content.add_child(quantityContainer);
        content.add_child(priceContainer);
        content.add_child(buttonContainer);

        container.add_child(header);
        container.add_child(content);
        dialog.add_child(container);

        // Позиціонування
        const monitor = Main.layoutManager.primaryMonitor;
        dialog.set_position(
            Math.floor((monitor.width - 300) / 2),
            Math.floor((monitor.height - 200) / 2)
        );

        Main.layoutManager.addChrome(dialog);
        dialog.show();
        quantityEntry.grab_key_focus();
        quantityEntry.set_selection(0, -1);
    }

    _drawChart(area) {
        if (this._assetsData.length === 0) return;
        
        const cr = area.get_context();
        const width = area.width;
        const height = area.height;
        const radius = Math.min(width, height) / 2 - 10;
        const centerX = width / 2;
        const centerY = height / 2;
        
        let totalValue = 0;
        this._assetsData.forEach(asset => {
            totalValue += asset.price * asset.quantity;
        });
        
        if (totalValue === 0) return;
        
        let currentAngle = 0;
        this._assetsData.forEach(asset => {
            const assetValue = asset.price * asset.quantity;
            const angle = (assetValue / totalValue) * 2 * Math.PI;
            
            cr.arc(centerX, centerY, radius, currentAngle, currentAngle + angle);
            cr.lineTo(centerX, centerY);
            cr.closePath();
            
            const color = asset.color || '#73fc03ff';
            cr.setSourceRGBA(
                parseInt(color.substr(1, 2), 16) / 255,
                parseInt(color.substr(3, 2), 16) / 255,
                parseInt(color.substr(5, 2), 16) / 255,
                0.9
            );
            cr.fill();
            
            currentAngle += angle;
        });
        
        cr.$dispose();
    }

    disable() {
        this._hidePortfolioWindow();
        this._hideSearchWindow();
        
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
        
        this._isWindowVisible = false;
        this._isSearchVisible = false;
    }
}