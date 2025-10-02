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
        this._isChartView = true;
        this._chartToggleButton = null;
        this._priceHistory = []; // Зберігаємо історію цін
        this._maxHistoryPoints = 30; // Ліміт точок для продуктивності
    }

    enable() {
        try {
            this._initDataStorage();
            this._loadAssetsData();
            if (this._assetsData.length > 0) {
                this._updatePriceHistory();
            }
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
            
            this._priceUpdateInterval = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                5 * 60 * 1000,
                () => {
                    this._updateAssetPrices();
                    return true; // Продовжити інтервал
                }
            );
            
        } catch (e) {
            log(`Error enabling extension: ${e}`);
        }
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
                
                if (!success) {
                    log("Не вдалося прочитати файл даних");
                    this._assetsData = [];
                    return;
                }
                
                // Перевірка 1: чи є взагалі дані для декодування
                if (!contents || contents.length === 0) {
                    log("Файл даних порожній");
                    this._assetsData = [];
                    return;
                }
                
                const decoder = new TextDecoder('utf-8');
                const jsonString = decoder.decode(contents);
                
                // Перевірка 2: чи не порожній рядок після декодування
                if (!jsonString || jsonString.trim().length === 0) {
                    log("Файл містить лише пробіли");
                    this._assetsData = [];
                    return;
                }
                
                // Перевірка 3: спроба парсингу JSON
                let data;
                try {
                    data = JSON.parse(jsonString);
                } catch (parseError) {
                    log(`Помилка парсингу JSON: ${parseError}`);
                    this._assetsData = [];
                    return;
                }
                
                // Перевірка 4: чи є потрібна структура даних
                if (!data || typeof data !== 'object') {
                    log("Некоректна структура даних у файлі");
                    this._assetsData = [];
                    return;
                }
                
                this._assetsData = data.assets || [];
                
                // Ініціалізація полів за замовчуванням
                this._assetsData.forEach(asset => {
                    if (asset.purchasePrice === undefined) {
                        asset.purchasePrice = asset.price || 0;
                    }
                    if (!asset.purchaseDate) {
                        asset.purchaseDate = new Date().toISOString().split('T')[0];
                    }
                });
                
                log(`Завантажено ${this._assetsData.length} активів`);
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
            if (!symbol || symbol.trim().length === 0) {
                resolve(null);
                return;
            }

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
                log(`Помилка запиту до Yahoo Finance: ${e}`);
                resolve(null);
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

    _setupSearchFocusHandling() {
        this._searchEntry.connect('notify::has-focus', (entry) => {
            if (!entry.has_focus && this._searchButton.has_style_class_name('expanded')) {
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
            this._collapseToButton();
        } else {
            this._expandToSearch();
        }
    }

    _expandToSearch() {
        this._searchButton.add_style_class_name('expanded');
        this._searchEntry.show();
        this._searchEntry.set_text('');
        this._searchIcon.icon_name = 'window-close-symbolic';
        
        setTimeout(() => {
            this._searchEntry.grab_key_focus();
        }, 150);
        
        this._setupSearchFocusHandling();
    }

    _collapseToButton() {
        this._searchButton.remove_style_class_name('expanded');
        this._hideSuggestions();
        this._searchIcon.icon_name = 'edit-find-symbolic';
        
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

        this._searchButton = new St.Button({
            style_class: 'search-button',
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        const searchButtonContent = new St.BoxLayout({
            style_class: 'search-button-content'
        });

        this._searchEntry = new St.Entry({
            style_class: 'search-entry',
            visible: false,
            can_focus: true
        });

        this._setupSearchEntry();
        searchButtonContent.add_child(this._searchEntry);

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
            return Clutter.EVENT_STOP;
        });

        this._searchButton.connect('button-press-event', (actor, event) => {
            const [x, y] = event.get_coords();
            const [entryX, entryY] = this._searchEntry.get_transformed_position();
            const entryWidth = this._searchEntry.width;
            const entryHeight = this._searchEntry.height;
            
            const clickedOnEntry = (x >= entryX && x <= entryX + entryWidth && 
                                y >= entryY && y <= entryY + entryHeight);
            
            if (clickedOnEntry && this._searchButton.has_style_class_name('expanded')) {
                return Clutter.EVENT_PROPAGATE;
            }
            
            if (this._searchButton.has_style_class_name('expanded')) {
                this._collapseToButton();
            } else {
                this._expandToSearch();
            }
            return Clutter.EVENT_STOP;
        });

        this._chartToggleButton = new St.Button({
            child: new St.Icon({ 
                icon_name: 'view-pie-symbolic',
                style_class: 'chart-toggle-icon'
            }),
            style_class: 'chart-toggle-button'
        });

        this._chartToggleButton.connect('clicked', () => {
            this._toggleChartView();
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
        editHeaderContainer.add_child(this._chartToggleButton);
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

        const scrollContainer = new St.ScrollView({
            style_class: 'portfolio-scroll-container',
            overlay_scrollbars: true
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
        
        assetsHeader.add_child(new St.Label({
            text: 'DATE',
            style_class: 'assets-header-label asset-date'
        }));
        
        assetsHeader.add_child(new St.Label({
            text: '',
            style_class: 'assets-header-label asset-delete'
        }));

        assetsColumn.add_child(assetsHeader);

        this._assetsContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'assets-container'
        });
        
        assetsColumn.add_child(this._assetsContainer);
        scrollContainer.add_child(assetsColumn);
        contentArea.add_child(scrollContainer);

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

        this._chartTitle = new St.Label({
            text: 'Розподіл портфеля:',
            style_class: 'chart-title'
        });
        chartContainer.add_child(this._chartTitle);

        this._chartArea = new St.DrawingArea({
            style_class: 'chart-area',
            width: 200,  // Додайте фіксовану ширину
            height: 200
        });
        
        this._chartArea.connect('repaint', (area) => {
            this._drawChart(area);
        });

        this._chartLegend = new St.BoxLayout({
            vertical: true,
            style_class: 'chart-legend'
        });

        chartContainer.add_child(this._chartArea);
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

        this._updateChartView();
    }

    _repositionWindow() {
        if (!this._window || !this._button) return;
        
        try {
            const [buttonX, buttonY] = this._button.get_transformed_position();
            const panelHeight = Main.panel.height;
            const monitor = Main.layoutManager.primaryMonitor;
            
            // Перевірка на коректні координати
            if (buttonX === undefined || buttonY === undefined) {
                this._window.set_size(450, 600);
                this._window.set_position(100, 100);
                return;
            }
            
            const x = Math.min(buttonX, monitor.width - 450);
            const y = buttonY + panelHeight + 10;
            
            // Гарантуємо мінімальні розміри
            this._window.set_size(450, 600);
            this._window.set_position(Math.max(0, x), Math.max(0, y));
            
        } catch (error) {
            log(`Помилка позиціонування вікна: ${error}`);
            this._window.set_size(450, 600);
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

        const dateContainer = new St.BoxLayout({
            style_class: 'purchase-field-container'
        });
        dateContainer.add_child(new St.Label({
            text: 'Дата купівлі:',
            style_class: 'purchase-label'
        }));
        const dateEntry = new St.Entry({
            text: new Date().toISOString().split('T')[0],
            style_class: 'purchase-entry'
        });
        dateContainer.add_child(dateEntry);

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
            const purchaseDate = dateEntry.text || new Date().toISOString().split('T')[0];
            
            if (quantity > 0 && purchasePrice > 0) {
                const newAsset = {
                    symbol: asset.symbol,
                    price: asset.price,
                    currentPrice: asset.price,
                    purchasePrice: purchasePrice,
                    quantity: quantity,
                    purchaseDate: purchaseDate,
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
                    existingAsset.purchaseDate = purchaseDate;
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
        dateEntry.connect('key-press-event', handleEnter);

        buttonContainer.add_child(addButton);
        buttonContainer.add_child(cancelButton);

        container.add_child(message);
        container.add_child(quantityContainer);
        container.add_child(priceContainer);
        container.add_child(dateContainer);
        container.add_child(buttonContainer);
        dialog.add_child(container);

        const monitor = Main.layoutManager.primaryMonitor;
        dialog.set_position(
            Math.floor((monitor.width - 300) / 2),
            Math.floor((monitor.height - 250) / 2)
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
        if (!this._assetsContainer || !this._assetsData || !this._window) {
            return;
        }
        if (!this._isWindowVisible || this._window.width <= 0 || this._window.height <= 0) {
            return;
        }
        try {
            if (!this._isChartView) {
                this._updatePriceHistory();
            }
            
            // Очищаємо контейнери
            this._assetsContainer.destroy_all_children();
            if (this._chartLegend) {
                this._chartLegend.destroy_all_children();
            }

            // ШВИДКІ розрахунки загальних показників
            let totalValue = 0;
            let totalInvestment = 0;
            let totalProfit = 0;

            for (let i = 0; i < this._assetsData.length; i++) {
                const asset = this._assetsData[i];
                if (!asset) continue;
                
                const price = asset.price || 0;
                const purchasePrice = asset.purchasePrice || price;
                const quantity = asset.quantity || 1;
                
                const assetValue = price * quantity;
                const assetInvestment = purchasePrice * quantity;
                const assetProfit = assetValue - assetInvestment;

                totalValue += assetValue;
                totalInvestment += assetInvestment;
                totalProfit += assetProfit;
            }

            const totalProfitability = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;

            // ШВИДКЕ створення рядків активів
            for (let i = 0; i < this._assetsData.length; i++) {
                const asset = this._assetsData[i];
                if (!asset) continue;
                
                const assetValue = (asset.price || 0) * (asset.quantity || 1);
                const percentage = totalValue > 0 ? (assetValue / totalValue * 100) : 0;
                const profitability = this._calculateProfitability(asset.price, asset.purchasePrice);

                const assetRow = new St.BoxLayout({
                    style_class: "asset-row"
                });

                // Додаємо всі елементи рядка
                assetRow.add_child(new St.Label({
                    text: asset.symbol,
                    style_class: 'row-symbol'
                }));

                assetRow.add_child(new St.Label({
                    text: `$${(asset.price || 0).toFixed(2)}`,
                    style_class: 'row-price'
                }));

                if (this._isEditMode) {
                    const purchasePriceEntry = new St.Entry({
                        text: (asset.purchasePrice || 0).toFixed(2),
                        style_class: 'edit-entry-field'
                    });
                
                    purchasePriceEntry.clutter_text.connect('text-changed', () => {
                        const newPrice = parseFloat(purchasePriceEntry.get_text()) || asset.purchasePrice;
                        asset.purchasePrice = newPrice;
                    });
                    assetRow.add_child(purchasePriceEntry);
                } else {
                    assetRow.add_child(new St.Label({
                        text: `$${(asset.purchasePrice || 0).toFixed(2)}`,
                        style_class: 'row-purchase-price'
                    }));
                }

                if (this._isEditMode) {
                    const quantityEntry = new St.Entry({
                        text: (asset.quantity || 1).toString(),
                        style_class: 'edit-entry-field'
                    });
                
                    quantityEntry.clutter_text.connect('text-changed', () => {
                        const newQuantity = parseInt(quantityEntry.get_text()) || asset.quantity;
                        asset.quantity = newQuantity;
                    });
                
                    assetRow.add_child(quantityEntry);
                } else {
                    assetRow.add_child(new St.Label({
                        text: (asset.quantity || 1).toString(),
                        style_class: 'row-quantity'
                    }));
                }

                const profitabilityColor = profitability >= 0 ? 'profit-positive' : 'profit-negative';
                assetRow.add_child(new St.Label({
                    text: `${profitability.toFixed(2)}%`,
                    style_class: `row-profitability ${profitabilityColor}`
                }));

                // Дата
                if (this._isEditMode) {
                    const dateEntry = new St.Entry({
                        text: asset.purchaseDate || new Date().toISOString().split('T')[0],
                        style_class: 'edit-entry-field'
                    });
                
                    dateEntry.clutter_text.connect('text-changed', () => {
                        asset.purchaseDate = dateEntry.get_text();
                    });
                    assetRow.add_child(dateEntry);
                } else {
                    assetRow.add_child(new St.Label({
                        text: asset.purchaseDate || new Date().toISOString().split('T')[0],
                        style_class: 'row-date'
                    }));
                }

                // Кнопка видалення
                if (this._isEditMode) {
                    const deleteButton = new St.Button({
                        child: new St.Icon({ 
                            icon_name: 'window-close-symbolic',
                            style_class: 'delete-icon'
                        }),
                        style_class: 'delete-button'
                    });

                    deleteButton.connect('clicked', () => {
                        this._deleteAsset(i);
                    });

                    assetRow.add_child(deleteButton);
                } else {
                    assetRow.add_child(new St.Label({
                        text: '',
                        style_class: 'row-empty'
                    }));
                }

                this._assetsContainer.add_child(assetRow);

                // ШВИДКА легенда для графіка
                if (this._chartLegend) {
                    const legendItem = new St.BoxLayout({
                        style_class: 'legend-item'
                    });

                    const colorBox = new St.Widget({
                        style: `background-color: ${asset.color || '#73fc03'}; width: 12px; height: 12px; border-radius: 2px; margin-right: 8px;`
                    });

                    let legendText;
                    if (this._isChartView) {
                        legendText = `${asset.symbol}: ${percentage.toFixed(1)}%`;
                    } else {
                        legendText = `${asset.symbol}: $${assetValue.toFixed(2)}`;
                    }

                    const legendLabel = new St.Label({
                        text: legendText,
                        style_class: 'legend-label'
                    });

                    legendItem.add_child(colorBox);
                    legendItem.add_child(legendLabel);
                    this._chartLegend.add_child(legendItem);
                }
            }

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

            // Оновлюємо графік (МІНІМАЛЬНИЙ ВПЛИВ)
            if (this._chartArea) {
                this._chartArea.width = this._chartArea.width; // Примусове оновлення розміру
                this._chartArea.queue_repaint();
            }
        } catch (e) {
            log(`Помилка оновлення портфеля: ${e}`);
        }
        if (!this._isWindowVisible) return;
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

    _toggleChartView() {
        this._isChartView = !this._isChartView;
        
        // Оновлюємо історію при перемиканні на графік тренду
        if (!this._isChartView) {
            this._updatePriceHistory();
        }
        
        this._updateChartView();
    }

    _updateChartView() {
        if (this._chartToggleButton) {
            if (this._isChartView) {
                this._chartToggleButton.get_child().icon_name = 'view-pie-symbolic';
                this._chartTitle.set_text('Розподіл портфеля:');
            } else {
                this._chartToggleButton.get_child().icon_name = 'view-line-symbolic'; // Змінити іконку
                this._chartTitle.set_text('Тренд портфеля:');
            }
        }
        
        this._updatePortfolioData();
    }

        // Додайте метод для оновлення історії цін
    _updatePriceHistory() {
        try {
            const totalValue = this._calculateTotalValue();
            const profitability = this._calculateTotalProfitability();
            const now = Date.now();
            
            if (isNaN(totalValue) || isNaN(profitability)) return;
            
            // Додаємо нову точку
            this._priceHistory.push({
                timestamp: now,
                value: totalValue,
                profitability: profitability
            });
            
            // Обмежуємо кількість точок
            if (this._priceHistory.length > this._maxHistoryPoints) {
                this._priceHistory = this._priceHistory.slice(-this._maxHistoryPoints);
            }
            
            // Логування для дебагу (тимчасово)
            if (this._priceHistory.length % 5 === 0) {
                log(`Історія цін: ${this._priceHistory.length} точок, остання вартість: $${totalValue.toFixed(2)}`);
            }
            
        } catch (e) {
            log(`Помилка оновлення історії цін: ${e}`);
        }
    }

    // Додайте ці методи для розрахунків
    _calculateTotalValue() {
        let total = 0;
        for (let i = 0; i < this._assetsData.length; i++) {
            const asset = this._assetsData[i];
            total += (asset.price || 0) * (asset.quantity || 1);
        }
        return total;
    }

    _calculateTotalProfitability() {
        let totalInvestment = 0;
        let totalValue = 0;
        
        for (let i = 0; i < this._assetsData.length; i++) {
            const asset = this._assetsData[i];
            const price = asset.price || 0;
            const purchasePrice = asset.purchasePrice || price;
            const quantity = asset.quantity || 1;
            
            totalValue += price * quantity;
            totalInvestment += purchasePrice * quantity;
        }
        
        return totalInvestment > 0 ? ((totalValue - totalInvestment) / totalInvestment) * 100 : 0;
    }

    // Оновіть метод для малювання графіка тренду
    _drawTrendChart(area) {
        if (this._isChartView || !this._priceHistory || this._priceHistory.length < 2) {
            return;
        }
        
        try {
            if (!area) return;
            
            const width = area.width || 200;
            const height = area.height || 200;
            
            if (width <= 10 || height <= 10) return;
            
            const cr = area.get_context();
            if (!cr) return;
            
            // Очищення фону
            cr.setSourceRGBA(0.95, 0.95, 0.95, 0.1); // Світло-сірий фон
            cr.paint();
            
            // Знаходимо мінімальні та максимальні значення для масштабування
            let minValue = Infinity;
            let maxValue = -Infinity;
            
            for (let i = 0; i < this._priceHistory.length; i++) {
                const point = this._priceHistory[i];
                minValue = Math.min(minValue, point.value);
                maxValue = Math.max(maxValue, point.value);
            }
            
            // Додаємо 10% відступу для кращого відображення
            const valueRange = maxValue - minValue;
            const padding = valueRange * 0.1;
            minValue -= padding;
            maxValue += padding;
            
            const adjustedValueRange = maxValue - minValue || 1;
            
            const chartPadding = 15;
            const chartWidth = width - chartPadding * 2;
            const chartHeight = height - chartPadding * 2;
            
            // Малюємо сітку
            cr.setSourceRGBA(0.7, 0.7, 0.7, 0.3);
            cr.setLineWidth(0.5);
            
            // Горизонтальні лінії
            for (let i = 0; i <= 4; i++) {
                const y = chartPadding + (i / 4) * chartHeight;
                cr.moveTo(chartPadding, y);
                cr.lineTo(chartPadding + chartWidth, y);
                cr.stroke();
            }
            
            // Вертикальні лінії
            for (let i = 0; i <= 4; i++) {
                const x = chartPadding + (i / 4) * chartWidth;
                cr.moveTo(x, chartPadding);
                cr.lineTo(x, chartPadding + chartHeight);
                cr.stroke();
            }
            
            // Малюємо лінію вартості (основну)
            cr.setSourceRGBA(0.2, 0.6, 0.2, 0.8);
            cr.setLineWidth(2.5);
            
            cr.moveTo(
                chartPadding,
                chartPadding + chartHeight - ((this._priceHistory[0].value - minValue) / adjustedValueRange) * chartHeight
            );
            
            for (let i = 1; i < this._priceHistory.length; i++) {
                const point = this._priceHistory[i];
                const x = chartPadding + (i / (this._priceHistory.length - 1)) * chartWidth;
                const y = chartPadding + chartHeight - ((point.value - minValue) / adjustedValueRange) * chartHeight;
                
                cr.lineTo(x, y);
            }
            cr.stroke();
            
            // Малюємо точки на графіку
            cr.setSourceRGBA(0.2, 0.6, 0.2, 1);
            for (let i = 0; i < this._priceHistory.length; i++) {
                const point = this._priceHistory[i];
                const x = chartPadding + (i / (this._priceHistory.length - 1)) * chartWidth;
                const y = chartPadding + chartHeight - ((point.value - minValue) / adjustedValueRange) * chartHeight;
                
                cr.arc(x, y, 2, 0, 2 * Math.PI);
                cr.fill();
            }
            
            // Додаємо підписи осей (опційно)
            cr.setSourceRGBA(0.3, 0.3, 0.3, 0.8);
            cr.setFontSize(10);
            
            // Мінімальне значення
            cr.moveTo(chartPadding - 5, chartPadding + chartHeight + 2);
            cr.showText(`$${minValue.toFixed(0)}`);
            
            // Максимальне значення
            cr.moveTo(chartPadding - 5, chartPadding - 2);
            cr.showText(`$${maxValue.toFixed(0)}`);
            
        } catch (e) {
            log(`Помилка малювання графіка тренду: ${e}`);
        }
    }

    _drawChart(area) {
        if (this._isChartView) {
            this._drawPieChart(area); // Кругова діаграма
        } else {
            this._drawTrendChart(area); // Графік тренду
        }
    }

    _drawPieChart(area) {
        if (!this._isChartView || !this._assetsData || this._assetsData.length === 0) {
            return;
        }
        
        try {
            if (!area) return;
            
            const width = area.width || 200;
            const height = area.height || 200;
            
            if (width <= 10 || height <= 10) return;
            
            const cr = area.get_context();
            if (!cr) return;
            
            // Просте очищення
            cr.setSourceRGBA(0, 0, 0, 0);
            cr.paint();
            
            const radius = Math.min(width, height) / 2 - 5; // Менше обчислень
            const centerX = width / 2;
            const centerY = height / 2;
            
            if (radius <= 5) return;
            
            // Швидкий розрахунок загальної вартості
            let totalValue = 0;
            for (let i = 0; i < this._assetsData.length; i++) {
                const asset = this._assetsData[i];
                totalValue += (asset.price || 0) * (asset.quantity || 1);
            }
            
            if (totalValue <= 0) return;
            
            // Спрощене малювання
            let currentAngle = 0;
            for (let i = 0; i < this._assetsData.length; i++) {
                const asset = this._assetsData[i];
                const assetValue = (asset.price || 0) * (asset.quantity || 1);
                const angle = (assetValue / totalValue) * 2 * Math.PI;
                
                if (angle <= 0.001) continue;
                
                cr.arc(centerX, centerY, radius, currentAngle, currentAngle + angle);
                cr.lineTo(centerX, centerY);
                cr.closePath();
                
                // Прості кольори без складних перетворень
                const color = asset.color || this._getRandomColor();
                let r, g, b;
                
                if (color && color.startsWith('#') && color.length === 7) {
                    r = parseInt(color.substr(1, 2), 16) / 255;
                    g = parseInt(color.substr(3, 2), 16) / 255;
                    b = parseInt(color.substr(5, 2), 16) / 255;
                } else {
                    // Швидкий запасний колір
                    r = 0.4; g = 0.7; b = 0.4;
                }
                
                cr.setSourceRGBA(r, g, b, 0.8);
                cr.fill();
                
                currentAngle += angle;
            }
            
        } catch (e) {
            // Мовчки ігноруємо помилки
        }
    }

    disable() {
        try {
            this._hidePortfolioWindow();
            this._hideSearchWindow();
            this._hideSuggestions();
            
            if (this._priceUpdateInterval) {
                GLib.Source.remove(this._priceUpdateInterval);
                this._priceUpdateInterval = null;
            }
            
            if (this._button) {
                this._button.destroy();
                this._button = null;
            }
            
            this._window = null;
            this._searchWindow = null;
            this._suggestionsWindow = null;
            this._assetsData = [];
            
            this._isWindowVisible = false;
            this._isSearchVisible = false;
            
            log('Portfolio extension disabled successfully');
        } catch (e) {
            log(`Error disabling extension: ${e}`);
        }
    }
}