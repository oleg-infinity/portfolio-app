// Import from the new versions of the modules
import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Cairo from 'gi://cairo';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export default class MyExtension {
    constructor() {
        this._button = null;
        this._window = null;
        this._isWindowVisible = false;
        this._assetsData = [];
        this._clickOutsideHandlerId = null;
    }

    enable() {
        // Create a PanelMenu.Button instead of St.Bin
        this._button = new PanelMenu.Button(30.0, 'MyExtension', false);
        this._button.add_style_class_name('myextension-button');

        // Create the portfolio icon
        this._portfolioIcon = new St.Icon({
            icon_name: 'folder-symbolic',
            style_class: 'system-status-icon portfolio-icon'
        });
        
        // Add the icon to the button
        this._button.add_child(this._portfolioIcon);
        
        // Connect the click handler to the button
        this._button.connect('button-press-event', (actor, event) => {
            this._togglePortfolioWindow();
            return Clutter.EVENT_STOP;
        });

        // Add the button to the panel on the LEFT side
        Main.panel.addToStatusArea('MyExtension', this._button, 0, 'left');
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
        
        // Add window to the stage
        Main.layoutManager.addChrome(this._window);
        this._isWindowVisible = true;
        this._portfolioIcon.icon_name = 'folder-open-symbolic';
        this._updatePortfolioData();
        
        // Focus the window
        this._window.show();

        // Add click outside handler
        this._addClickOutsideHandler();
    }

    _hidePortfolioWindow() {
        if (this._window && this._isWindowVisible) {
            this._window.hide();
            Main.layoutManager.removeChrome(this._window);
            this._isWindowVisible = false;
            this._portfolioIcon.icon_name = 'folder-symbolic';
            
            // Remove click outside handler
            this._removeClickOutsideHandler();
        }
    }

    _createPortfolioWindow() {
        // Create main window with minimal styling
        this._window = new St.Widget({
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: 460,
            height: 540
        });

        // Create main container
        const mainContainer = new St.BoxLayout({
            vertical: true
        });

        // Create header
        const header = new St.BoxLayout();
        
        const title = new St.Label({
            text: 'Мій портфель'
        });
        header.add_child(title);

        // Create content area (assets list + chart)
        const contentArea = new St.BoxLayout();

        // Left column - assets list
        const assetsColumn = new St.BoxLayout({
            vertical: true
        });

        // Assets header
        const assetsHeader = new St.BoxLayout();
        
        assetsHeader.add_child(new St.Label({
            text: 'Актив'
        }));
        
        assetsHeader.add_child(new St.Label({
            text: 'Ціна'
        }));
        
        assetsHeader.add_child(new St.Label({
            text: 'Кількість'
        }));

        assetsColumn.add_child(assetsHeader);

        // Assets container
        this._assetsContainer = new St.BoxLayout({
            vertical: true
        });
        
        assetsColumn.add_child(this._assetsContainer);

        // Right column - chart
        const chartColumn = new St.BoxLayout({
            vertical: true
        });

        const chartTitle = new St.Label({
            text: 'Розподіл активів'
        });
        chartColumn.add_child(chartTitle);

        this._chartArea = new St.DrawingArea({
            width: 160,
            height: 160
        });
        
        this._chartArea.connect('repaint', (area) => {
            this._drawChart(area);
        });

        chartColumn.add_child(this._chartArea);

        // Chart legend
        this._chartLegend = new St.BoxLayout({
            vertical: true
        });
        chartColumn.add_child(this._chartLegend);

        // Add columns to content area
        contentArea.add_child(assetsColumn);
        contentArea.add_child(chartColumn);

        // Footer - total value
        const footer = new St.BoxLayout();
        
        this._totalValueLabel = new St.Label({
            text: 'Загальна вартість: $0.00'
        });
        footer.add_child(this._totalValueLabel);

        // Assemble the window
        mainContainer.add_child(header);
        mainContainer.add_child(contentArea);
        mainContainer.add_child(footer);
        
        this._window.add_child(mainContainer);

        // Position window near the panel button
        this._repositionWindow();

        // Close on Escape key
        this._window.connect('key-press-event', (actor, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Escape) {
                this._hidePortfolioWindow();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Stop event propagation when clicking inside the window
        this._window.connect('button-press-event', (actor, event) => {
            return Clutter.EVENT_STOP;
        });
    }

    _addClickOutsideHandler() {
        this._removeClickOutsideHandler(); // Remove existing handler first
        
        this._clickOutsideHandlerId = global.stage.connect('button-press-event', (actor, event) => {
            if (this._window && this._isWindowVisible) {
                const [windowX, windowY] = this._window.get_transformed_position();
                const windowWidth = this._window.width;
                const windowHeight = this._window.height;
                
                const [clickX, clickY] = event.get_coords();
                
                // Check if click is outside the window
                if (clickX < windowX || clickX > windowX + windowWidth ||
                    clickY < windowY || clickY > windowY + windowHeight) {
                    this._hidePortfolioWindow();
                }
            }
        });
    }

    _removeClickOutsideHandler() {
        if (this._clickOutsideHandlerId) {
            global.stage.disconnect(this._clickOutsideHandlerId);
            this._clickOutsideHandlerId = null;
        }
    }

    _repositionWindow() {
        if (!this._window || !this._button) return;
        
        try {
            const [buttonX, buttonY] = this._button.get_transformed_position();
            const panelHeight = Main.panel.height;
            
            const x = Math.max(10, buttonX - 180);
            const y = buttonY + panelHeight + 10;
            
            this._window.set_position(x, y);
        } catch (error) {
            console.error('Error repositioning window:', error);
            this._window.set_position(100, 100);
        }
    }

    _updatePortfolioData() {
        // Clear existing assets and legend
        this._assetsContainer.destroy_all_children();
        this._chartLegend.destroy_all_children();
        
        // Sample data
        this._assetsData = [
            { symbol: 'QWER.US', price: 150.25, quantity: 10, color: '#FF6B6B' },
            { symbol: 'EEEE.EU', price: 45.80, quantity: 25, color: '#4ECDC4' },
            { symbol: 'AAPL.US', price: 175.30, quantity: 5, color: '#45B7D1' },
            { symbol: 'TSLA.US', price: 210.75, quantity: 8, color: '#96CEB4' },
            { symbol: 'MSFT.US', price: 325.40, quantity: 3, color: '#FFE66D' }
        ];

        let totalValue = 0;

        // Calculate total value first
        this._assetsData.forEach(asset => {
            const assetValue = asset.price * asset.quantity;
            totalValue += assetValue;
        });

        // Create asset rows and calculate percentages
        this._assetsData.forEach(asset => {
            const assetValue = asset.price * asset.quantity;
            const percentage = totalValue > 0 ? (assetValue / totalValue * 100) : 0;

            const assetRow = new St.BoxLayout();

            // Symbol
            assetRow.add_child(new St.Label({
                text: asset.symbol
            }));

            // Price
            assetRow.add_child(new St.Label({
                text: `$${asset.price.toFixed(2)}`
            }));

            // Quantity and percentage
            const quantityInfo = new St.BoxLayout({
                vertical: true
            });
            
            quantityInfo.add_child(new St.Label({
                text: asset.quantity.toString()
            }));
            
            quantityInfo.add_child(new St.Label({
                text: `${percentage.toFixed(1)}%`
            }));

            assetRow.add_child(quantityInfo);
            this._assetsContainer.add_child(assetRow);

            // Add to chart legend
            const legendItem = new St.BoxLayout();

            const colorBox = new St.Widget({
                style: `background-color: ${asset.color}; width: 12px; height: 12px;`
            });

            const legendLabel = new St.Label({
                text: `${asset.symbol} (${percentage.toFixed(1)}%)`
            });

            legendItem.add_child(colorBox);
            legendItem.add_child(legendLabel);
            this._chartLegend.add_child(legendItem);
        });

        // Update total value
        this._totalValueLabel.set_text(`Загальна вартість: $${totalValue.toFixed(2)}`);

        // Redraw chart
        this._chartArea.queue_repaint();
    }

    _drawChart(area) {
        if (this._assetsData.length === 0) return;

        const cr = area.get_context();
        const width = area.width;
        const height = area.height;
        const radius = Math.min(width, height) / 2 - 10;
        const centerX = width / 2;
        const centerY = height / 2;

        // Calculate total value
        let totalValue = 0;
        this._assetsData.forEach(asset => {
            totalValue += asset.price * asset.quantity;
        });

        if (totalValue === 0) return;

        let currentAngle = 0;

        // Draw pie chart segments
        this._assetsData.forEach(asset => {
            const assetValue = asset.price * asset.quantity;
            const angle = (assetValue / totalValue) * 2 * Math.PI;

            // Draw segment
            cr.arc(centerX, centerY, radius, currentAngle, currentAngle + angle);
            cr.lineTo(centerX, centerY);
            cr.closePath();

            // Set color
            const color = asset.color;
            cr.setSourceRGBA(
                parseInt(color.substr(1, 2), 16) / 255,
                parseInt(color.substr(3, 2), 16) / 255,
                parseInt(color.substr(5, 2), 16) / 255,
                0.9
            );
            cr.fill();

            // Draw segment border
            cr.arc(centerX, centerY, radius, currentAngle, currentAngle + angle);
            cr.setSourceRGBA(1, 1, 1, 0.3);
            cr.setLineWidth(1);
            cr.stroke();

            currentAngle += angle;
        });

        // Draw center circle for donut chart effect
        cr.arc(centerX, centerY, radius * 0.4, 0, 2 * Math.PI);
        cr.setSourceRGBA(0.2, 0.2, 0.2, 1);
        cr.fill();

        cr.$dispose();
    }

    disable() {
        this._hidePortfolioWindow();
        
        this._removeClickOutsideHandler();
        
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