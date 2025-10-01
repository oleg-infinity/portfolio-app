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
        this._isEditMode = false;
        this._suggestionsWindow = null;
        this._suggestionsList = [];
        this._currentSearchTimeout = null;
        this._priceUpdateInterval = null;
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
        
        // Оновлюємо ціни кожні 5 хвилин
        this._priceUpdateInterval = setInterval(() => {
            this._updateAssetPrices();
        }, 5 * 60 * 1000);
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
                    
                    this._assetsData.forEach(asset => {
                        if (asset.purchasePrice === undefined) {
                            asset.purchasePrice = asset.price || 0;
                        }
                    });
                    
                    log(`Завантажено ${this._assetsData.length} активів`);
                }
            } else {
                this._assetsData = [];
                this._saveAssetsData();
            }
        } catch (e) {
            log(`Помилка завантаження даних: ${e}`);
            this._assetsData = [];
        }
    }

    _saveAssetsData() {
        try {
            const data = {
                version: '1.1',
                lastUpdate: new Date().toISOString(),
                assets: this._assetsData
            };
            
            const encoder = new TextEncoder();
            const jsonString = JSON.stringify(data, null, 2);
            const bytes = encoder.encode(jsonString);
            
            GLib.file_set_contents(this._dataFile, bytes);
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
                                    purchasePrice: price
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

    _searchSuggestions(query) {
        return new Promise((resolve, reject) => {
            if (!query || query.length < 2) {
                resolve([]);
                return;
            }

            const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=5`;
            
            try {
                const file = Gio.File.new_for_uri(url);
                const cancellable = new Gio.Cancellable();
            
                file.load_contents_async(cancellable, (file, result) => {
                    try {
                        const [success, contents] = file.load_contents_finish(result);
                    
                        if (!success) {
                            resolve([]);
                            return;
                        }
                    
                        const decoder = new TextDecoder('utf-8');
                        const responseText = decoder.decode(contents);
                        const json = JSON.parse(responseText);
                    
                        if (json.quotes) {
                            const suggestions = json.quotes
                                .filter(quote => quote.quoteType === 'EQUITY')
                                .slice(0, 5)
                                .map(quote => ({
                                    symbol: quote.symbol,
                                    name: quote.shortname || quote.longname || quote.symbol,
                                    exchange: quote.exchange
                                }));
                            resolve(suggestions);
                        } else {
                            resolve([]);
                        }
                    } catch (e) {
                        log(`Помилка при парсингу автодоповнень: ${e}`);
                        resolve([]);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    _showSuggestions(suggestions) {
        this._hideSuggestions();
        
        if (suggestions.length === 0) return;
        
        this._suggestionsWindow = new St.Widget({
            style_class: 'suggestions-window',
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        const suggestionsContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'suggestions-container'
        });

        suggestions.forEach((suggestion) => {
            const suggestionItem = new St.Button({
                style_class: 'suggestion-item',
                reactive: true,
                can_focus: true,
                track_hover: true
            });

            const suggestionContent = new St.BoxLayout();

            const symbolLabel = new St.Label({
                text: suggestion.symbol,
                style_class: 'suggestion-symbol'
            });

            const nameLabel = new St.Label({
                text: ` - ${suggestion.name}`,
                style_class: 'suggestion-name'
            });

            suggestionContent.add_child(symbolLabel);
            suggestionContent.add_child(nameLabel);
            suggestionItem.add_child(suggestionContent);

            suggestionItem.connect('clicked', () => {
                this._searchEntry.set_text(suggestion.symbol);
                this._hideSuggestions();
                this._performSearchFromInput();
            });

            suggestionsContainer.add_child(suggestionItem);
        });

        this._suggestionsWindow.add_child(suggestionsContainer);
        
        // Позиціонування під кнопкою пошуку
        const [buttonX, buttonY] = this._searchButton.get_transformed_position();
        const buttonHeight = this._searchButton.height;
        
        this._suggestionsWindow.set_position(buttonX, buttonY + buttonHeight + 5);
        
        Main.layoutManager.addChrome(this._suggestionsWindow);
        this._suggestionsWindow.show();
    }

    _hideSuggestions() {
        if (this._suggestionsWindow) {
            this._suggestionsWindow.destroy();
            this._suggestionsWindow = null;
        }
    }

    // Додайте цей метод до класу
    _hideSearchWindow() {
        if (this._searchWindow && this._isSearchVisible) {
            this._searchWindow.destroy();
            this._searchWindow = null;
            this._isSearchVisible = false;
        }
    }

    _setupSearchEntry() {
        let timeoutId = null;
        
        this._searchEntry.clutter_text.connect('text-changed', () => {
            const query = this._searchEntry.get_text().trim();
            
            if (timeoutId) {
                GLib.Source.remove(timeoutId);
                timeoutId = null;
            }
            
            if (query.length < 2) {
                this._hideSuggestions();
                return;
            }
            
            timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                this._searchSuggestions(query).then(suggestions => {
                    if (this._searchEntry && this._searchEntry.visible) {
                        this._showSuggestions(suggestions);
                    }
                }).catch(error => {
                    log(`Помилка пошуку підказок: ${error}`);
                });
                timeoutId = null;
                return false;
            });
        });

        this._searchEntry.clutter_text.connect('key-press-event', (actor, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Escape) {
                this._hideSuggestions();
                this._toggleSearchInput();
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                this._hideSuggestions();
                this._performSearchFromInput();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    // Додайте цей метод після методу _setupSearchEntry:
    _setupSearchFocusHandling() {
        // Обробка втрати фокусу
        this._searchEntry.connect('notify::has-focus', (entry) => {
            if (!entry.has_focus && this._searchButton.has_style_class_name('expanded')) {
                // Чекаємо трохи перед закриттям, щоб дати час для кліку на підказки
                setTimeout(() => {
                    if (!this._searchEntry.has_focus && !this._suggestionsWindow) {
                        this._collapseToButton();
                    }
                }, 200);
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

    _toggleEditMode() {
        this._isEditMode = !this._isEditMode;
    
        if (this._isEditMode) {
            this._editModeButton.get_child().icon_name = 'emblem-system-symbolic';
            this._editModeButton.add_style_pseudo_class('active');
        } else {
            this._editModeButton.get_child().icon_name = 'emblem-system-symbolic';
            this._editModeButton.remove_style_pseudo_class('active');
            this._saveAssetsData();
        }
    
        this._updatePortfolioData();
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

    _performSearchFromInput() {
        const symbol = this._searchEntry.get_text().trim().toUpperCase();
        if (!symbol) return;

        this._searchAsset(symbol).then(asset => {
            if (asset) {
                this._askForPurchaseDetails(asset);
                this._toggleSearchInput();
            } else {
                Main.notify(`Актив "${symbol}" не знайдено`);
            }
        }).catch(error => {
            log(`Помилка пошуку: ${error}`);
            Main.notify('Помилка пошуку');
        });
    }

    _updateAssetPrices() {
        const updatePromises = this._assetsData.map(asset => {
            return this._searchAsset(asset.symbol).then(updatedAsset => {
                if (updatedAsset) {
                    asset.price = updatedAsset.price;
                    asset.currentPrice = updatedAsset.price;
                }
            }).catch(error => {
                log(`Помилка оновлення ціни для ${asset.symbol}: ${error}`);
            });
        });

        Promise.all(updatePromises).then(() => {
            this._updatePortfolioData();
            this._saveAssetsData();
        });
    }

    _toggleSearchInput() {
        const isExpanded = this._searchButton.has_style_class_name('expanded');

        if (isExpanded) {
            // Згортаємо назад в кнопку
            this._collapseToButton();
        } else {
            // Розширюємо в поле пошуку
            this._expandToSearch();
        }
    }

    _expandToSearch() {
        // Додаємо клас для анімації
        this._searchButton.add_style_class_name('expanded');
        this._searchEntry.show();
        this._searchEntry.set_text('');
        this._searchIcon.icon_name = 'window-close-symbolic';
        
        // Чекаємо трохи перед фокусом
        setTimeout(() => {
            this._searchEntry.grab_key_focus();
        }, 150);
        
        // Викликаємо налаштування фокусу
        this._setupSearchFocusHandling();
    }

    _collapseToButton() {
        // Видаляємо клас для анімації зворотнього
        this._searchButton.remove_style_class_name('expanded');
        this._hideSuggestions();
        this._searchIcon.icon_name = 'edit-find-symbolic';
        
        // Чекаємо завершення анімації перед схованням поля
        setTimeout(() => {
            this._searchEntry.hide();
            this._searchEntry.set_text('');
        }, 300);
    }
    
    _createPortfolioWindow() {
        this._window = new St.Widget({
            style_class: 'portfolio-window',
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        const mainContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-container'
        });

        const header = new St.BoxLayout({
            style_class: 'portfolio-header'
        });

        const titleContainer = new St.BoxLayout({
            style_class: 'title-container'
        });
        
        const title = new St.Label({
            text: 'My Portfolio',
            style_class: 'portfolio-title'
        });
        titleContainer.add_child(title);

        const rightContainer = new St.BoxLayout({
            style_class: 'right-container'
        });

        const searchContainer = new St.BoxLayout({
            style_class: 'search-container'
        });

        // Створюємо кнопку, яка буде містити поле вводу
        this._searchButton = new St.Button({
            style_class: 'search-button',
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        // Створюємо контейнер всередині кнопки
        const searchButtonContent = new St.BoxLayout({
            style_class: 'search-button-content'
        });

        // Поле пошуку всередині кнопки
        this._searchEntry = new St.Entry({
            style_class: 'search-entry',
            visible: false,
            can_focus: true
        });

        this._setupSearchEntry();
        searchButtonContent.add_child(this._searchEntry);

        // Іконка пошуку
        this._searchIcon = new St.Icon({ 
            icon_name: 'edit-find-symbolic',
            style_class: 'search-icon'
        });
        searchButtonContent.add_child(this._searchIcon);

        this._searchIcon.connect('button-press-event', (actor, event) => {
            if (this._searchButton.has_style_class_name('expanded')) {
                this._collapseToButton();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._searchButton.add_child(searchButtonContent);

        this._searchButton.connect('clicked', (actor, event) => {
            // Блокуємо подію, щоб поле вводу могло отримати фокус
            return Clutter.EVENT_STOP;
        });

        // Додаємо обробник для активації пошуку при кліку на кнопку
        this._searchButton.connect('button-press-event', (actor, event) => {
            // Перевіряємо, чи клік був на полі вводу
            const [x, y] = event.get_coords();
            const [entryX, entryY] = this._searchEntry.get_transformed_position();
            const entryWidth = this._searchEntry.width;
            const entryHeight = this._searchEntry.height;
            
            const clickedOnEntry = (x >= entryX && x <= entryX + entryWidth && 
                                y >= entryY && y <= entryY + entryHeight);
            
            // Якщо клік був на полі вводу - не обробляємо
            if (clickedOnEntry && this._searchButton.has_style_class_name('expanded')) {
                return Clutter.EVENT_PROPAGATE;
            }
            
            if (this._searchButton.has_style_class_name('expanded')) {
                // Якщо вже розширено, закриваємо
                this._collapseToButton();
            } else {
                // Якщо не розширено, відкриваємо
                this._expandToSearch();
            }
            return Clutter.EVENT_STOP;
        });

        const editHeaderContainer = new St.BoxLayout({
            style_class: 'edit-header-container'
        });

        this._editModeButton = new St.Button({
            child: new St.Icon({ 
                icon_name: 'emblem-system-symbolic',
                style_class: 'edit-mode-icon'
            }),
            style_class: 'edit-mode-button'
        });

        this._editModeButton.connect('clicked', () => {
            this._toggleEditMode();
        });

        searchContainer.add_child(this._searchButton);
        editHeaderContainer.add_child(this._editModeButton);

        rightContainer.add_child(searchContainer);
        rightContainer.add_child(editHeaderContainer);

        header.add_child(titleContainer);
        header.add_child(rightContainer);

        const horizontalLine = new St.BoxLayout({
            style_class: 'horizontal-line'
        });

        const contentArea = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-content'
        });

        const assetsColumn = new St.BoxLayout({
            vertical: true,
            style_class: 'assets-column'
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
            style_class: 'assets-container'
        });
    
        assetsColumn.add_child(this._assetsContainer);
        contentArea.add_child(assetsColumn);

        const bottomSection = new St.BoxLayout({
            style_class: 'portfolio-bottom-section'
        });

        const statsContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'stats-container'
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

        const chartContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'chart-container'
        });

        this._chartArea = new St.DrawingArea({
            style_class: 'chart-area'
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
    
        this._window.connect('button-press-event', () => {
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
            const x = Math.min(buttonX, monitor.width - 450);
            const y = buttonY + panelHeight + 10;
            this._window.set_position(x, y);
        } catch (error) {
            this._window.set_position(100, 100);
        }
    }

    _askForPurchaseDetails(asset) {
        const dialog = new St.Widget({
            style_class: 'purchase-dialog',
            reactive: true,
            can_focus: true
        });

        const container = new St.BoxLayout({
            vertical: true,
            style_class: 'purchase-container'
        });

        const message = new St.Label({
            text: `Додавання ${asset.symbol}`,
            style_class: 'purchase-message'
        });

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
                const newAsset = {
                    symbol: asset.symbol,
                    price: asset.price,
                    currentPrice: asset.price,
                    purchasePrice: purchasePrice,
                    quantity: quantity,
                    name: asset.name,
                    color: this._getRandomColor()
                };
                
                const existingIndex = this._assetsData.findIndex(a => a.symbol === asset.symbol);
                if (existingIndex >= 0) {
                    const existingAsset = this._assetsData[existingIndex];
                    const totalQuantity = existingAsset.quantity + quantity;
                    const averagePrice = ((existingAsset.purchasePrice * existingAsset.quantity) + 
                                        (purchasePrice * quantity)) / totalQuantity;
                    
                    existingAsset.quantity = totalQuantity;
                    existingAsset.purchasePrice = averagePrice;
                } else {
                    this._assetsData.push(newAsset);
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

        const monitor = Main.layoutManager.primaryMonitor;
        dialog.set_position(
            Math.floor((monitor.width - 300) / 2),
            Math.floor((monitor.height - 200) / 2)
        );

        Main.layoutManager.addChrome(dialog);
        dialog.show();
        quantityEntry.grab_key_focus();
    }

    _getRandomColor() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];
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
    
        this._assetsData.forEach(asset => {
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

            assetRow.add_child(new St.Label({
                text: asset.symbol,
                style_class: 'row-symbol'
            }));

            assetRow.add_child(new St.Label({
                text: `$${asset.price.toFixed(2)}`,
                style_class: 'row-price'
            }));

            if (this._isEditMode) {
                const purchasePriceEntry = new St.Entry({
                    text: asset.purchasePrice.toFixed(2),
                    style_class: 'edit-entry-field'
                });
            
                purchasePriceEntry.clutter_text.connect('text-changed', () => {
                    const newPrice = parseFloat(purchasePriceEntry.get_text()) || asset.purchasePrice;
                    asset.purchasePrice = newPrice;
                });
                assetRow.add_child(purchasePriceEntry);
            } else {
                assetRow.add_child(new St.Label({
                    text: `$${asset.purchasePrice.toFixed(2)}`,
                    style_class: 'row-purchase-price'
                }));
            }

            if (this._isEditMode) {
                const quantityEntry = new St.Entry({
                    text: asset.quantity.toString(),
                    style_class: 'edit-entry-field'
                });
            
                quantityEntry.clutter_text.connect('text-changed', () => {
                    const newQuantity = parseInt(quantityEntry.get_text()) || asset.quantity;
                    asset.quantity = newQuantity;
                });
            
                assetRow.add_child(quantityEntry);
            } else {
                assetRow.add_child(new St.Label({
                    text: asset.quantity.toString(),
                    style_class: 'row-quantity'
                }));
            }

            const profitabilityColor = profitability >= 0 ? 'profit-positive' : 'profit-negative';
            assetRow.add_child(new St.Label({
                text: `${profitability.toFixed(2)}%`,
                style_class: `row-profitability ${profitabilityColor}`
            }));

            if (this._isEditMode) {
                const deleteButton = new St.Button({
                    child: new St.Icon({ 
                        icon_name: 'window-close-symbolic',
                        style_class: 'delete-icon'
                    }),
                    style_class: 'delete-button'
                });

                deleteButton.connect('clicked', () => {
                    this._deleteAsset(index);
                });

                assetRow.add_child(deleteButton);
            }

            this._assetsContainer.add_child(assetRow);

            if (this._chartLegend) {
                const legendItem = new St.BoxLayout({
                    style_class: 'legend-item'
                });

                const colorBox = new St.Widget({
                    style: `background-color: ${asset.color || '#73fc03'}; width: 12px; height: 12px; border-radius: 2px;`
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

    _deleteAsset(index) {
        if (index < 0 || index >= this._assetsData.length) return;
    
        const asset = this._assetsData[index];
    
        const dialog = new St.Widget({
            style_class: 'confirm-dialog',
            reactive: true,
            can_focus: true
        });

        const container = new St.BoxLayout({
            vertical: true,
            style_class: 'confirm-container'
        });

        const message = new St.Label({
            text: `Видалити ${asset.symbol}?`,
            style_class: 'confirm-message'
        });

        const buttonContainer = new St.BoxLayout({
            style_class: 'confirm-buttons'
        });

        const confirmButton = new St.Button({
            label: 'Так',
            style_class: 'confirm-yes-button'
        });

        const cancelButton = new St.Button({
            label: 'Ні',
            style_class: 'confirm-cancel-button'
        });

        confirmButton.connect('clicked', () => {
            this._assetsData.splice(index, 1);
            this._updatePortfolioData();
            this._saveAssetsData();
            Main.layoutManager.removeChrome(dialog);
            Main.notify(`Видалено ${asset.symbol}`);
        });

        cancelButton.connect('clicked', () => {
            Main.layoutManager.removeChrome(dialog);
        });

        buttonContainer.add_child(confirmButton);
        buttonContainer.add_child(cancelButton);

        container.add_child(message);
        container.add_child(buttonContainer);
        dialog.add_child(container);

        const monitor = Main.layoutManager.primaryMonitor;
        dialog.set_position(
            Math.floor((monitor.width - 300) / 2),
            Math.floor((monitor.height - 150) / 2)
        );

        Main.layoutManager.addChrome(dialog);
        dialog.show();
    }

    _drawChart(area) {
        if (this._assetsData.length === 0) return;
        
        const cr = area.get_context();
        const width = area.get_width();
        const height = area.get_height();
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
            
            const color = asset.color || '#73fc03';
            const r = parseInt(color.substr(1, 2), 16) / 255;
            const g = parseInt(color.substr(3, 2), 16) / 255;
            const b = parseInt(color.substr(5, 2), 16) / 255;
            
            cr.setSourceRGBA(r, g, b, 0.9);
            cr.fill();
            
            currentAngle += angle;
        });
    }

    disable() {
        this._hidePortfolioWindow();
        this._hideSearchWindow();
        this._hideSuggestions();
        
        if (this._priceUpdateInterval) {
            clearInterval(this._priceUpdateInterval);
        }
        
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
        
        this._isWindowVisible = false;
        this._isSearchVisible = false;
    }
}