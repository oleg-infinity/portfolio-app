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
    }


    enable() {
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
        Main.panel.addToStatusArea('MyExtension', this._button, 30, 'left');
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
   
    // Решта коду залишається без змін...
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
                asset.quantity = 1;
                asset.color = this._getRandomColor();
                
                // Перевіряємо, чи актив вже є в портфелі
                const existingIndex = this._assetsData.findIndex(a => a.symbol === asset.symbol);
                if (existingIndex >= 0) {
                    this._assetsData[existingIndex].quantity += 1;
                } else {
                    this._assetsData.push(asset);
                }
                
                this._updatePortfolioData();
                this._hideSearchWindow();
                Main.notify(`Актив "${symbol}" додано до портфелю`);
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
        
        if (this._assetsData.length === 0) {
            this._assetsData = [
                { symbol: 'QWER.US', price: 150.25, quantity: 10, color: '#70ff4cff' },
                { symbol: 'EEEE.EU', price: 45.80, quantity: 25, color: '#33ff00ff' },
            ];
        }
        
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

             // Кнопка видалення
            const deleteButton = new St.Button({
                child: new St.Icon({ 
                    icon_name: 'window-close-symbolic',
                    style_class: 'delete-icon'
                }),
                style_class: 'delete-button',
                reactive: true,
                can_focus: true,
                track_hover: true
            });
        
            deleteButton.connect('clicked', () => {
                this._removeAsset(index);
            });

            quantityContainer.add_child(deleteButton);
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
    }

    _removeAsset(index) {
        if (index >= 0 && index < this._assetsData.length) {
            const removedAsset = this._assetsData[index];
            this._assetsData.splice(index, 1);
    
            this._updatePortfolioData();
            Main.notify(`Актив "${removedAsset.symbol}" видалено з портфелю`);
        }
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