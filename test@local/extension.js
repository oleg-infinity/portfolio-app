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
            // Отримуємо стандартну директорію для даних користувача
            const userDataDir = GLib.get_user_data_dir(); // Зазвичай ~/.local/share
            const extensionDataDir = `${userDataDir}/gnome-shell/extensions/test@local`;
            
            // Альтернативний варіант - використовуємо config директорію
            const userConfigDir = GLib.get_user_config_dir(); // Зазвичай ~/.config
            const configDataDir = `${userConfigDir}/test-portfolio`;
            
            // Вибираємо найкращий варіант
            let dataDir;
            if (GLib.file_test(extensionDataDir, GLib.FileTest.EXISTS)) {
                // Якщо директорія extension існує (для встановлених extensions)
                dataDir = extensionDataDir;
            } else {
                // Інакше використовуємо config директорію
                dataDir = configDataDir;
            }
            
            // Створюємо директорію якщо не існує
            if (!GLib.file_test(dataDir, GLib.FileTest.EXISTS)) {
                GLib.mkdir_with_parents(dataDir, 0o755);
                log(`Створено директорію для даних: ${dataDir}`);
            }
            
            this._dataFile = `${dataDir}/portfolio.json`;
            log(`Файл даних: ${this._dataFile}`);
            
        } catch (e) {
            log(`Помилка ініціалізації сховища: ${e}`);
            // Резервний варіант - домашня директорія
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
                    log(`Завантажено ${this._assetsData.length} активів`);
                }
            } else {
                // Файл не існує - створюємо порожній портфель
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
                version: '1.0',
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

            // Використовуємо простий підхід з Gio без Soup
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
                                    name: meta.shortName || meta.symbol
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
   
    _toggleSearchWindow() {
        if (this._isSearchVisible) {
            this._hideSearchWindow();
        } else {
            this._showSearchWindow();
        }
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
        this._window.raise_top();
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
            width: 500,
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
        
        const title = new St.Label({
            text: 'Мій портфель',
            style_class: 'portfolio-title'
        });
        header.add_child(title);

        // Кнопка пошуку
        const searchButton = new St.Button({
            child: new St.Icon({ icon_name: 'edit-find-symbolic' }),
            style_class: 'search-button'
        });
        searchButton.connect('clicked', () => {
            this._showSearchWindow();
        });
        header.add_child(searchButton);

        const contentArea = new St.BoxLayout({
            style_class: 'portfolio-content',
            x_expand: true,
            y_expand: true
        });

        const assetsColumn = new St.BoxLayout({
            vertical: true,
            style_class: 'assets-column',
            x_expand: true,
            width: 300,
            height: 450
        });

        const assetsHeader = new St.BoxLayout({
            style_class: 'assets-header',
            width: 100
        });
        
        assetsHeader.add_child(new St.Label({
            text: 'Актив',
            style_class: 'assets-header-label asset-name',
            width: 100
        }));
        
        assetsHeader.add_child(new St.Label({
            text: 'Ціна',
            style_class: 'assets-header-label asset-price',
            width: 100
        }));
        
        assetsHeader.add_child(new St.Label({
            text: 'Кількість',
            style_class: 'assets-header-label asset-quantity',
            width: 100
        }));

        assetsColumn.add_child(assetsHeader);

        this._assetsContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'assets-container',
            x_expand: true,
            y_expand: true,
            width: 300,
            height: 500
        });
        
        assetsColumn.add_child(this._assetsContainer);

        const chartColumn = new St.BoxLayout({
            vertical: true,
            style_class: 'chart-column'
        });

        this._chartArea = new St.DrawingArea({
            style_class: 'chart-area',
            width: 150,
            height: 150
        });
        
        this._chartArea.connect('repaint', (area) => {
            this._drawChart(area);
        });

        chartColumn.add_child(this._chartArea);

        this._chartLegend = new St.BoxLayout({
            vertical: true,
            style_class: 'chart-legend'
        });
        chartColumn.add_child(this._chartLegend);

        contentArea.add_child(assetsColumn);
        contentArea.add_child(chartColumn);

        const footer = new St.BoxLayout({
            style_class: 'portfolio-footer'
        });
        
        this._totalValueLabel = new St.Label({
            text: 'Загальна вартість: $0.00',
            style_class: 'total-value'
        });
        footer.add_child(this._totalValueLabel);

        mainContainer.add_child(header);
        mainContainer.add_child(contentArea);
        mainContainer.add_child(footer);
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
            const x = Math.min(buttonX, monitor.width - 450);
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
            label: 'Знайти та додати',
            style_class: 'search-action-button'
        });

        searchBtn.connect('clicked', () => {
            this._performSearch(entry, searchBtn);
        });

        buttonContainer.add_child(searchBtn);

        // Обробка Enter в полі вводу
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

        // Позиціонуємо вікно пошуку збоку від основного вікна
        this._repositionSearchWindow();
        
        Main.layoutManager.addChrome(this._searchWindow);
        this._searchWindow.show();
        this._isSearchVisible = true;
        
        // Фокусуємо поле вводу
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
                // Запитуємо кількість після успішного пошуку
                this._askForQuantity(asset);
                this._hideSearchWindow();
            } else {
                Main.notify(`Актив "${symbol}" не знайдено`);
            }
        } catch (error) {
            log(`Помилка пошуку: ${error}`);
            Main.notify('Помилка пошуку. Перевірте підключення до інтернету');
        } finally {
            searchBtn.label = 'Знайти та додати';
            searchBtn.set_reactive(true);
        }
    }

    _askForQuantity(asset) {
        const dialog = new St.Widget({
            style_class: 'quantity-dialog',
            reactive: true,
            can_focus: true,
            width: 300,
            height: 150
        });

        const container = new St.BoxLayout({
            vertical: true,
            style_class: 'quantity-container-dialog'
        });

        const message = new St.Label({
            text: `Введіть кількість для ${asset.symbol}:`,
            style_class: 'quantity-message'
        });

        const entryContainer = new St.BoxLayout();
        const quantityEntry = new St.Entry({
            text: '1',
            style_class: 'quantity-entry'
        });
        entryContainer.add_child(quantityEntry);

        const buttonContainer = new St.BoxLayout({
            style_class: 'quantity-buttons'
        });

        const addButton = new St.Button({
            label: 'Додати',
            style_class: 'quantity-add-button'
        });

        const cancelButton = new St.Button({
            label: 'Скасувати',
            style_class: 'quantity-cancel-button'
        });

        addButton.connect('clicked', () => {
            const quantity = parseInt(quantityEntry.text) || 1;
            if (quantity > 0) {
                asset.quantity = quantity;
                asset.color = this._getRandomColor();
                
                // Перевіряємо, чи актив вже є в портфелі
                const existingIndex = this._assetsData.findIndex(a => a.symbol === asset.symbol);
                if (existingIndex >= 0) {
                    this._assetsData[existingIndex].quantity += quantity;
                } else {
                    this._assetsData.push(asset);
                }
                
                this._updatePortfolioData();
                Main.layoutManager.removeChrome(dialog);
                Main.notify(`Додано ${quantity} ${asset.symbol}`);
            }
        });

        cancelButton.connect('clicked', () => {
            Main.layoutManager.removeChrome(dialog);
        });

        // Обробка Enter
        quantityEntry.connect('key-press-event', (actor, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                addButton.emit('clicked');
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        buttonContainer.add_child(addButton);
        buttonContainer.add_child(cancelButton);

        container.add_child(message);
        container.add_child(entryContainer);
        container.add_child(buttonContainer);
        dialog.add_child(container);

        // Позиціонування по центру
        const monitor = Main.layoutManager.primaryMonitor;
        dialog.set_position(
            Math.floor((monitor.width - 300) / 2),
            Math.floor((monitor.height - 150) / 2)
        );

        Main.layoutManager.addChrome(dialog);
        dialog.show();
        quantityEntry.grab_key_focus();
        quantityEntry.set_selection(0, -1); // Виділяємо весь текст
    }

    _repositionSearchWindow() {
        if (!this._searchWindow || !this._window) return;
        
        try {
            const [windowX, windowY] = this._window.get_position();
            const windowWidth = this._window.width;
            const monitor = Main.layoutManager.primaryMonitor;
            
            // Ставимо вікно пошуку праворуч від основного вікна
            const x = Math.min(windowX + windowWidth + 10, monitor.width - 350);
            const y = windowY;
            
            this._searchWindow.set_position(x, y);
        } catch (error) {
            console.error('Помилка позиціонування вікна пошуку:', error);
            // Якщо не вийшло, ставимо поруч з кнопкою
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
        const colors = ['#73fc03ff', '#4ECDC4', '#1b6808ff', '#96CEB4', '#FFE66D', '#FFA07A', '#98D8C8', '#F7DC6F'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    _updatePortfolioData() {
        this._assetsContainer.destroy_all_children();
        this._chartLegend.destroy_all_children();
        
        let totalValue = 0;
        this._assetsData.forEach(asset => {
            const assetValue = asset.price * asset.quantity;
            totalValue += assetValue;
        });
        
        this._assetsData.forEach((asset, index) => {
            const assetValue = asset.price * asset.quantity;
            const percentage = totalValue > 0 ? (assetValue / totalValue * 100) : 0;
            
            const assetRow = new St.BoxLayout({
                style_class: "asset-row"
            });
            
            assetRow.add_child(new St.Label({
                text: asset.symbol,
                style_class: 'asset-symbol',
                width: 80
            }));
            
            assetRow.add_child(new St.Label({
                text: `$${asset.price.toFixed(2)}`,
                style_class: 'asset-price',
                width: 80
            }));

            const quantityContainer = new St.BoxLayout({
                style_class: 'quantity-container'
            });
            
            quantityContainer.add_child(new St.Label({
                text: asset.quantity.toString(),
                style_class: 'asset-quantity',
                width: 50
            }));

            // Кнопка редагування (олівець)
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

            quantityContainer.add_child(editButton);
            assetRow.add_child(quantityContainer);
            
            this._assetsContainer.add_child(assetRow);
            
            const legendItem = new St.BoxLayout({
                style_class: 'legend-item'
            });
            
            const colorBox = new St.Widget({
                style: `background-color: ${asset.color}; width: 12px; height: 12px; border-radius: 2px;`
            });
            
            const legendLabel = new St.Label({
                text: `${asset.symbol} (${percentage.toFixed(1)}%)`,
                style_class: 'legend-label'
            });
            
            legendItem.add_child(colorBox);
            legendItem.add_child(legendLabel);
            this._chartLegend.add_child(legendItem);
        });
        
        this._totalValueLabel.set_text(`Загальна вартість: $${totalValue.toFixed(2)}`);
        this._chartArea.queue_repaint();
        
        // Зберігаємо дані після оновлення
        this._saveAssetsData();
    }

    _editAsset(index) {
        if (index < 0 || index >= this._assetsData.length) return;
        
        const asset = this._assetsData[index];
        const dialog = new St.Widget({
            style_class: 'edit-dialog',
            reactive: true,
            can_focus: true,
            width: 350,
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

        const quantityContainer = new St.BoxLayout();
        quantityContainer.add_child(new St.Label({
            text: 'Кількість:',
            style_class: 'edit-label'
        }));
        
        const quantityEntry = new St.Entry({
            text: asset.quantity.toString(),
            style_class: 'edit-entry'
        });
        quantityContainer.add_child(quantityEntry);

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
            if (newQuantity > 0) {
                asset.quantity = newQuantity;
                this._updatePortfolioData();
                Main.layoutManager.removeChrome(dialog);
                Main.notify(`Оновлено ${asset.symbol}`);
            }
        });

        deleteButton.connect('clicked', () => {
            this._assetsData.splice(index, 1);
            this._updatePortfolioData();
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
        content.add_child(buttonContainer);

        container.add_child(header);
        container.add_child(content);
        dialog.add_child(container);

        // Позиціонування
        const monitor = Main.layoutManager.primaryMonitor;
        dialog.set_position(
            Math.floor((monitor.width - 350) / 2),
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
            
            const color = asset.color;
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