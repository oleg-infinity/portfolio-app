// Import from the new versions of the modules
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class MyExtension {
    constructor() {
        this._button = null;
        this._window = null;
        this._isWindowVisible = false;
        this._assetsData = [];
        this._searchResults = [];
    }

    enable() {
        this._button = new PanelMenu.Button(0.0, 'MyExtension', false);
        
        // Додаємо іконку
        let icon = new St.Icon({
            icon_name: 'emblem-money-symbolic',
            style_class: 'system-status-icon'
        });
        
        this._button.add_child(icon);
        
        this._button.connect('button-press-event', () => {
            this._togglePortfolioWindow();
        });

        //Main.panel.addToStatusArea('my-extension-indicator', this._button);
        
        // Завантаження тестових даних
        this._loadSampleData();
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
        this._window.show();
    }

    _hidePortfolioWindow() {
        if (this._window && this._isWindowVisible) {
            this._window.hide();
            Main.layoutManager.removeChrome(this._window);
            this._isWindowVisible = false;
        }
    }

    _createPortfolioWindow() {
        this._window = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-window',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: 400,
            height: 500
        });

        // Header
        const header = new St.BoxLayout({
            vertical: false,
            style_class: 'portfolio-header'
        });
        
        const title = new St.Label({
            text: '💰 Мій портфель',
            style_class: 'portfolio-title'
        });
        header.add_child(title);

        // Пошук
        const searchContainer = new St.BoxLayout({
            vertical: false,
            style_class: 'search-container'
        });
        
        this._searchEntry = new St.Entry({
            hint_text: 'Пошук активів...',
            style_class: 'search-entry'
        });
        
        this._searchEntry.connect('text-changed', () => {
            this._handleSearchInput();
        });
        
        searchContainer.add_child(this._searchEntry);
        header.add_child(searchContainer);

        this._window.add_child(header);

        // Результати пошуку
        this._searchResultsContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'search-results-container',
            visible: false
        });
        this._window.add_child(this._searchResultsContainer);

        // Контейнер для активів
        this._assetsContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'assets-container'
        });
        this._window.add_child(this._assetsContainer);

        // Footer
        const footer = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-footer'
        });
        
        this._totalValueLabel = new St.Label({
            text: 'Загальна вартість: $0.00',
            style_class: 'total-value'
        });
        
        this._totalProfitLabel = new St.Label({
            text: 'Дохід: $0.00 (0.00%)',
            style_class: 'total-profit'
        });
        
        footer.add_child(this._totalValueLabel);
        footer.add_child(this._totalProfitLabel);
        this._window.add_child(footer);

        this._repositionWindow();
        this._updatePortfolioData();
    }

    _loadSampleData() {
        // Тестові дані для демонстрації
        this._assetsData = [
            {
                symbol: 'AAPL',
                name: 'Apple Inc.',
                quantity: 10,
                purchasePrice: 150.00,
                currentPrice: 175.30,
                purchaseDate: '2023-01-15'
            },
            {
                symbol: 'TSLA',
                name: 'Tesla Inc.',
                quantity: 5,
                purchasePrice: 200.00,
                currentPrice: 210.75,
                purchaseDate: '2023-03-20'
            }
        ];
    }

    _handleSearchInput() {
        const query = this._searchEntry.get_text().trim().toUpperCase();
        
        if (query.length < 1) {
            this._hideSearchResults();
            return;
        }
        
        const popularAssets = [
            {symbol: 'AAPL', name: 'Apple Inc.', type: 'stock'},
            {symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock'},
            {symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'stock'},
            {symbol: 'MSFT', name: 'Microsoft Corporation', type: 'stock'},
            {symbol: 'BTC-USD', name: 'Bitcoin USD', type: 'crypto'},
            {symbol: 'ETH-USD', name: 'Ethereum USD', type: 'crypto'}
        ];
        
        this._searchResults = popularAssets.filter(asset => 
            asset.symbol.includes(query) || asset.name.toUpperCase().includes(query)
        );
        
        this._showSearchResults();
    }

    _showSearchResults() {
        this._searchResultsContainer.destroy_all_children();
        this._searchResultsContainer.visible = true;
        
        if (this._searchResults.length === 0) {
            const noResults = new St.Label({
                text: 'Нічого не знайдено',
                style_class: 'no-results'
            });
            this._searchResultsContainer.add_child(noResults);
            return;
        }
        
        this._searchResults.forEach((asset) => {
            const resultItem = new St.BoxLayout({
                vertical: false,
                style_class: 'search-result-item'
            });
            
            const symbolLabel = new St.Label({
                text: asset.symbol,
                style_class: 'search-result-symbol'
            });
            
            const nameLabel = new St.Label({
                text: asset.name,
                style_class: 'search-result-name'
            });
            
            const addButton = new St.Button({
                label: '+',
                style_class: 'add-button'
            });
            
            addButton.connect('clicked', () => {
                this._addAsset(asset.symbol, asset.name, 1, 100);
                this._hideSearchResults();
                this._searchEntry.set_text('');
            });
            
            resultItem.add_child(symbolLabel);
            resultItem.add_child(nameLabel);
            resultItem.add_child(addButton);
            
            this._searchResultsContainer.add_child(resultItem);
        });
    }

    _hideSearchResults() {
        this._searchResultsContainer.visible = false;
        this._searchResultsContainer.destroy_all_children();
    }

    _addAsset(symbol, name, quantity, price) {
        const newAsset = {
            symbol: symbol,
            name: name,
            quantity: quantity,
            purchasePrice: price,
            currentPrice: price,
            purchaseDate: new Date().toISOString().split('T')[0],
            color: this._getRandomColor()
        };
        
        this._assetsData.push(newAsset);
        this._updatePortfolioData();
    }

    _getRandomColor() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFE66D'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    _updatePortfolioData() {
        this._refreshUI();
    }

    _refreshUI() {
        if (!this._assetsContainer) return;
        
        this._assetsContainer.destroy_all_children();

        let totalValue = 0;
        let totalCost = 0;

        this._assetsData.forEach((asset, index) => {
            const currentValue = asset.currentPrice * asset.quantity;
            const cost = asset.purchasePrice * asset.quantity;
            const profit = currentValue - cost;
            const profitPercent = cost > 0 ? (profit / cost) * 100 : 0;
            
            totalValue += currentValue;
            totalCost += cost;

            const assetRow = new St.BoxLayout({
                vertical: false,
                style_class: 'asset-row'
            });

            // Символ
            const symbolLabel = new St.Label({
                text: asset.symbol,
                style_class: 'asset-symbol'
            });
            assetRow.add_child(symbolLabel);

            // Ціна
            const priceLabel = new St.Label({
                text: `$${asset.currentPrice.toFixed(2)}`,
                style_class: 'asset-price'
            });
            assetRow.add_child(priceLabel);

            // Кількість
            const quantityLabel = new St.Label({
                text: `x${asset.quantity}`,
                style_class: 'asset-quantity'
            });
            assetRow.add_child(quantityLabel);

            // Дохідність
            const profitLabel = new St.Label({
                text: `${profit >= 0 ? '+' : ''}${profitPercent.toFixed(1)}%`,
                style_class: profit >= 0 ? 'profit-positive' : 'profit-negative'
            });
            assetRow.add_child(profitLabel);

            // Кнопка редагування
            const editButton = new St.Button({
                label: '✎',
                style_class: 'edit-button'
            });
            
            editButton.connect('clicked', () => {
                this._editAsset(index);
            });
            assetRow.add_child(editButton);

            this._assetsContainer.add_child(assetRow);
        });

        // Оновлення загальної інформації
        const totalProfit = totalValue - totalCost;
        const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
        
        this._totalValueLabel.set_text(`Загальна вартість: $${totalValue.toFixed(2)}`);
        
        const profitText = totalProfit >= 0 ? `+$${totalProfit.toFixed(2)}` : `-$${Math.abs(totalProfit).toFixed(2)}`;
        this._totalProfitLabel.set_text(`Дохід: ${profitText} (${totalProfitPercent.toFixed(2)}%)`);
        this._totalProfitLabel.style_class = totalProfit >= 0 ? 'profit-positive' : 'profit-negative';
    }

    _editAsset(index) {
        const asset = this._assetsData[index];
        
        // Спрощене редагування - просто видаляємо
        this._assetsData.splice(index, 1);
        this._updatePortfolioData();
    }

    _repositionWindow() {
        if (!this._window || !this._button) return;
        
        try {
            const button = this._button.container;
            const [buttonX, buttonY] = button.get_transformed_position();
            const panelHeight = Main.panel.height;
            
            this._window.set_position(buttonX - 150, buttonY + panelHeight + 5);
        } catch (error) {
            console.error('Error repositioning window:', error);
            this._window.set_position(100, 100);
        }
    }

    disable() {
        this._hidePortfolioWindow();
        
        if (this._window) {
            this._window.destroy();
            this._window = null;
        }
        
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
        
        this._isWindowVisible = false;
    }
}