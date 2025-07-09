class CopilotUsageAnalyzer {
    constructor() {
        this.rawData = [];
        this.filteredData = [];
        this.quotaData = [];
        this.filteredQuotaData = [];
        this.charts = {};
        this.currentTab = 'usage-dashboard';
        
        // Pagination settings
        this.currentPage = 1;
        this.currentQuotaPage = 1;
        this.rowsPerPage = 20;
        this.totalPages = 1;
        this.totalQuotaPages = 1;
        
        // Data processing settings
        this.chunkSize = 1000; // Number of rows to process at once
        this.processingComplete = false;
        
        // Cache settings
        this.cacheKey = 'copilot-analyzer-cache';
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        // Dashboard settings
        this.dashboardConfig = {
            darkMode: false
        };
        
        // Load saved settings if available
        this.loadSettings();
        
        this.init();
        
        console.log('CopilotUsageAnalyzer initialized');
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('csvFileInput').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('loadSampleData').addEventListener('click', () => this.loadSampleData());
        document.getElementById('dateRange').addEventListener('change', () => this.applyFilters());
        document.getElementById('userFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('modelFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('searchInput').addEventListener('input', () => this.filterTable());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportFilteredData());
        
        // Quota tab event listeners
        document.getElementById('quotaUserFilter').addEventListener('change', () => this.applyQuotaFilters());
        document.getElementById('quotaDateRange').addEventListener('change', () => this.applyQuotaFilters());
        document.getElementById('quotaSearchInput').addEventListener('input', () => this.filterQuotaTable());
        document.getElementById('quotaExportBtn').addEventListener('click', () => this.exportQuotaData());
        
        // Tab event listeners
        this.setupTabEventListeners();
        
        // Modal event listeners
        this.setupModalEventListeners();
        
        // Stat card click listeners
        this.setupStatCardListeners();
        
        // Pagination event listeners
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('pagination-btn') && !e.target.classList.contains('quota-page')) {
                const page = parseInt(e.target.dataset.page);
                this.goToPage(page);
            }
        });
        
        // Dark mode toggle
        document.getElementById('darkModeToggle').addEventListener('change', () => this.toggleDarkMode());
        
        // Check for cached data on load
        this.checkForCachedData();
        
        // Apply dark mode if set in settings
        if (this.dashboardConfig.darkMode) {
            document.getElementById('darkModeToggle').checked = true;
            this.toggleDarkMode();
        }
    }
    
    loadSettings() {
        try {
            const savedConfig = localStorage.getItem('copilot-dashboard-config');
            if (savedConfig) {
                this.dashboardConfig = JSON.parse(savedConfig);
            }
        } catch (error) {
            console.error('Error loading dashboard settings:', error);
        }
    }
    
    saveDashboardConfig() {
        try {
            // Save current settings
            localStorage.setItem('copilot-dashboard-config', JSON.stringify(this.dashboardConfig));
            this.showNotification('Dashboard configuration saved successfully');
        } catch (error) {
            console.error('Error saving dashboard settings:', error);
            this.showNotification('Failed to save dashboard configuration');
        }
    }
    
    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        this.dashboardConfig.darkMode = document.body.classList.contains('dark-mode');
        
        // Update charts with new theme colors
        this.updateChartsTheme();
        
        // Save setting
        localStorage.setItem('copilot-dashboard-config', JSON.stringify(this.dashboardConfig));
    }
    
    updateChartsTheme() {
        // Update all charts with new theme colors
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.update === 'function') {
                // Update chart colors based on theme
                const isDarkMode = document.body.classList.contains('dark-mode');
                
                // Update grid lines color
                if (chart.options.scales?.x) {
                    chart.options.scales.x.grid = {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                    };
                }
                
                if (chart.options.scales?.y) {
                    chart.options.scales.y.grid = {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                    };
                    
                    // Update tick color
                    chart.options.scales.y.ticks = {
                        color: isDarkMode ? '#b8b8b8' : '#666'
                    };
                }
                
                if (chart.options.scales?.x) {
                    chart.options.scales.x.ticks = {
                        color: isDarkMode ? '#b8b8b8' : '#666'
                    };
                }
                
                // Update chart
                chart.update();
            }
        });
    }
    
    checkForCachedData() {
        try {
            const cachedData = localStorage.getItem(this.cacheKey);
            if (cachedData) {
                const data = JSON.parse(cachedData);
                
                // Check if cache is still valid
                if (data.timestamp && (Date.now() - data.timestamp) < this.cacheExpiry) {
                    // Restore data from cache
                    this.showLoadingIndicator('Loading cached data...');
                    
                    setTimeout(() => {
                        this.rawData = data.rawData.map(row => {
                            return {
                                ...row,
                                timestamp: new Date(row.timestamp) // Convert timestamp string back to Date object
                            };
                        });
                        
                        this.hideLoadingIndicator();
                        this.processData();
                        
                        // Show notification
                        this.showNotification('Data loaded from cache. Upload new data for fresh results.');
                    }, 500);
                    
                    return true;
                }
            }
        } catch (error) {
            console.error('Error loading cached data:', error);
            // Clear potentially corrupted cache
            localStorage.removeItem(this.cacheKey);
        }
        
        return false;
    }
    
    cacheRawData() {
        try {
            // Store raw data in localStorage
            const dataToCache = {
                timestamp: Date.now(),
                rawData: this.rawData
            };
            
            localStorage.setItem(this.cacheKey, JSON.stringify(dataToCache));
        } catch (error) {
            console.error('Error caching data:', error);
            // If storage fails (e.g. quota exceeded), clear old cache and try again
            try {
                localStorage.clear();
                localStorage.setItem(this.cacheKey, JSON.stringify({
                    timestamp: Date.now(),
                    rawData: this.rawData
                }));
            } catch (retryError) {
                console.error('Failed to cache data after retry:', retryError);
            }
        }
    }
    
    showNotification(message) {
        // Create notification if it doesn't exist
        if (!document.getElementById('notification')) {
            const notification = document.createElement('div');
            notification.id = 'notification';
            notification.className = 'notification';
            notification.innerHTML = `
                <div class="notification-content">
                    <span class="notification-message">${message}</span>
                    <button class="notification-close">&times;</button>
                </div>
            `;
            document.body.appendChild(notification);
            
            // Add styles if not already in the document
            if (!document.getElementById('notification-styles')) {
                const style = document.createElement('style');
                style.id = 'notification-styles';
                style.textContent = `
                    .notification {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        z-index: 9999;
                        animation: slideIn 0.3s ease-out;
                    }
                    .notification-content {
                        background: #667eea;
                        color: white;
                        padding: 15px 20px;
                        border-radius: 8px;
                        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }
                    .notification-message {
                        flex: 1;
                    }
                    .notification-close {
                        background: none;
                        border: none;
                        color: white;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                    }
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            // Add close button event listener
            const closeBtn = notification.querySelector('.notification-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    notification.remove();
                });
            }
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 5000);
        }
    }

    async loadSampleData() {
        // Show loading indicator
        this.showLoadingIndicator('Loading sample data...');
        
        try {
            console.log('Attempting to load sample data from ./data_example.csv');
            const response = await fetch('./data_example.csv');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const csvText = await response.text();
            console.log('Sample data loaded successfully, length:', csvText.length);
            this.parseCSV(csvText);
        } catch (error) {
            console.error('Error loading sample data:', error);
            // Try without the ./ prefix
            try {
                console.log('Trying fallback path: data_example.csv');
                const response = await fetch('data_example.csv');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const csvText = await response.text();
                console.log('Sample data loaded successfully from fallback path, length:', csvText.length);
                this.parseCSV(csvText);
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                this.hideLoadingIndicator();
                alert('Error loading sample data. Please upload your own CSV file.');
            }
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Show loading indicator
        this.showLoadingIndicator(`Reading file: ${file.name}`);
        console.log('Reading uploaded file:', file.name, 'size:', file.size);

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('File read successfully, length:', e.target.result.length);
            this.parseCSV(e.target.result);
        };
        reader.onerror = (e) => {
            console.error('Error reading file:', e);
            this.hideLoadingIndicator();
            alert('Error reading the file. Please try again.');
        };
        reader.readAsText(file);
    }

    parseCSV(csvText) {
        if (!csvText || csvText.trim() === '') {
            console.error('Empty CSV data received');
            this.hideLoadingIndicator();
            alert('The CSV file appears to be empty. Please check the file and try again.');
            return;
        }
        
        console.log('Starting CSV parsing...');
        const lines = csvText.trim().split('\n');
        console.log('CSV lines count:', lines.length);
        
        if (lines.length < 2) {
            console.error('CSV has too few lines:', lines.length);
            this.hideLoadingIndicator();
            alert('The CSV file does not contain enough data. Please check the format.');
            return;
        }
        
        try {
            const headers = this.parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
            console.log('CSV headers:', headers);
            
            this.rawData = [];
            this.processingComplete = false;
            
            // Show loading indicator
            this.showLoadingIndicator('Parsing CSV data...');
            
            // Use chunked processing for large files
            this.processCSVChunks(lines, headers, 1);
        } catch (error) {
            console.error('Error parsing CSV:', error);
            this.hideLoadingIndicator();
            alert('Error parsing the CSV file. Please check the format and try again.');
        }
    }
    
    processCSVChunks(lines, headers, startIndex) {
        try {
            // Process a chunk of the CSV data
            const endIndex = Math.min(startIndex + this.chunkSize, lines.length);
            
            // Update loading progress
            const progress = Math.floor((startIndex / lines.length) * 100);
            this.updateLoadingProgress(progress);
            
            console.log(`Processing CSV chunk: ${startIndex} to ${endIndex} (${progress}%)`);
            
            // Debug first few headers
            if (startIndex === 1) {
                console.log('Headers detected:', headers);
                // Check if we have the expected headers
                const requiredHeaders = ['Timestamp', 'User', 'Model', 'Requests Used', 'Exceeds Monthly Quota', 'Total Monthly Quota'];
                const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
                if (missingHeaders.length > 0) {
                    console.warn('Missing required headers:', missingHeaders);
                }
            }
            
            // Process this chunk
            for (let i = startIndex; i < endIndex; i++) {
                try {
                    const values = this.parseCSVLine(lines[i]).map(v => v.trim().replace(/^"|"$/g, ''));
                    
                    if (values.length === headers.length) {
                        const row = {};
                        headers.forEach((header, index) => {
                            row[header] = values[index];
                        });
                        
                        // Debug first few rows
                        if (i < 5) {
                            console.log(`Row ${i} data:`, row);
                        }
                        
                        // Parse the data with correct field mapping
                        const timestamp = new Date(row.Timestamp);
                        if (!isNaN(timestamp.getTime()) && row.User && row.Model) {
                            this.rawData.push({
                                timestamp: timestamp,
                                user: row.User,
                                model: row.Model,
                                requests: parseFloat(row['Requests Used']) || 1,
                                exceedsQuota: row['Exceeds Monthly Quota'] === 'TRUE' || row['Exceeds Monthly Quota'] === 'True',
                                quota: parseInt(row['Total Monthly Quota']) || 300,
                                // Keep original data for export
                                originalData: row
                            });
                        } else {
                            console.warn(`Skipping row ${i} due to invalid data:`, 
                                        `timestamp valid: ${!isNaN(timestamp.getTime())}, `,
                                        `user: ${row.User}, model: ${row.Model}`);
                        }
                    } else {
                        console.warn(`Skipping row ${i} due to column count mismatch. Expected ${headers.length}, got ${values.length}`);
                        if (i < 10) {
                            console.log(`Row ${i} content:`, lines[i]);
                        }
                    }
                } catch (rowError) {
                    console.error(`Error processing row ${i}:`, rowError);
                    // Continue with next row
                }
            }
            
            // If there are more chunks to process, schedule the next chunk
            if (endIndex < lines.length) {
                setTimeout(() => {
                    this.processCSVChunks(lines, headers, endIndex);
                }, 0); // Use setTimeout to avoid blocking the UI
            } else {
                // All chunks processed
                console.log('CSV processing complete. Total rows processed:', this.rawData.length);
                this.hideLoadingIndicator();
                
                if (this.rawData.length === 0) {
                    alert('No valid data found in the CSV file. Please check the format.');
                    return;
                }
                
                // Save to cache
                this.cacheRawData();
                
                this.processingComplete = true;
                this.processData();
            }
        } catch (error) {
            console.error('Error in processCSVChunks:', error);
            this.hideLoadingIndicator();
            alert('Error processing the CSV data. Please check the console for details.');
        }
    }
    
    showLoadingIndicator(message) {
        // Create loading overlay if it doesn't exist
        if (!document.getElementById('loading-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-message">${message}</div>
                    <div class="loading-progress-container">
                        <div class="loading-progress-bar"></div>
                    </div>
                    <div class="loading-percentage">0%</div>
                </div>
            `;
            document.body.appendChild(overlay);
            
            // Add styles if not already in the document
            if (!document.getElementById('loading-styles')) {
                const style = document.createElement('style');
                style.id = 'loading-styles';
                style.textContent = `
                    #loading-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0, 0, 0, 0.7);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 9999;
                    }
                    .loading-container {
                        background: white;
                        padding: 30px;
                        border-radius: 10px;
                        text-align: center;
                        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                        max-width: 80%;
                    }
                    .loading-spinner {
                        border: 5px solid #f3f3f3;
                        border-top: 5px solid #667eea;
                        border-radius: 50%;
                        width: 50px;
                        height: 50px;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 20px;
                    }
                    .loading-message {
                        margin-bottom: 20px;
                        font-size: 18px;
                        color: #333;
                    }
                    .loading-progress-container {
                        width: 100%;
                        background-color: #f3f3f3;
                        border-radius: 5px;
                        margin-bottom: 10px;
                    }
                    .loading-progress-bar {
                        height: 10px;
                        border-radius: 5px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        width: 0%;
                        transition: width 0.3s ease;
                    }
                    .loading-percentage {
                        font-size: 16px;
                        color: #666;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            // Update message if overlay exists
            document.querySelector('.loading-message').textContent = message;
        }
    }
    
    updateLoadingProgress(percentage) {
        const progressBar = document.querySelector('.loading-progress-bar');
        const percentageText = document.querySelector('.loading-percentage');
        if (progressBar && percentageText) {
            progressBar.style.width = `${percentage}%`;
            percentageText.textContent = `${percentage}%`;
        }
    }
    
    hideLoadingIndicator() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    parseCSVLine(line) {
        // Handle UTF-8 BOM character that might be present at the start of the file
        if (line.charCodeAt(0) === 0xFEFF) {
            line = line.slice(1);
        }
        
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    processData() {
        if (this.rawData.length === 0) return;
        
        console.log('Processing data with', this.rawData.length, 'records');
        
        // Sort data by timestamp
        this.rawData.sort((a, b) => a.timestamp - b.timestamp);
        
        // Initialize filters
        this.populateFilters();
        
        // Process quota data
        this.processQuotaData();
        
        // Apply initial filters
        this.applyFilters();
        this.applyQuotaFilters();
        
        // Show dashboard
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
    }
    
    createSummaryDashboard() {
        try {
            // Check if we have data to display
            if (!this.rawData || this.rawData.length === 0) {
                console.log('No data available for summary dashboard');
                return;
            }
            
            console.log('Creating summary dashboard with', this.rawData.length, 'records');
            
            // Create trend charts
            this.createTrendCharts();
            
            // Create activity heatmap
            this.createActivityHeatmapFull();
            
            // Create model comparison chart
            this.createModelComparisonChart();
            
            // Create usage pattern charts
            this.createUsagePatternCharts();
        } catch (error) {
            console.error('Error creating summary dashboard:', error);
        }
    }
    
    createTrendCharts() {
        try {
            console.log('Creating trend charts with data:', this.filteredData.length);
            
            // Calculate trend data for different periods
            const trendData = this.calculateTrendData();
            console.log('Trend data calculated:', trendData);
            
            // Update trend values and indicators
            this.updateTrendValues(trendData);
            
            // Create mini trend charts
            this.createMiniTrendChart('totalRequestsTrendChart', trendData.totalRequests);
            this.createMiniTrendChart('activeUsersTrendChart', trendData.activeUsers);
            this.createMiniTrendChart('avgRequestsTrendChart', trendData.avgRequests);
        } catch (error) {
            console.error('Error creating trend charts:', error);
        }
    }
    
    calculateTrendData() {
        // Get sorted data by timestamp - use filtered data instead of raw data
        const sortedData = [...this.filteredData].sort((a, b) => a.timestamp - b.timestamp);
        console.log('Calculating trends with', sortedData.length, 'records');
        if (sortedData.length === 0) return { totalRequests: [], activeUsers: [], avgRequests: [] };
        
        // Get date ranges
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        const oneQuarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        const twoQuartersAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        
        // Calculate weekly trend data
        const currentWeekData = sortedData.filter(row => row.timestamp >= oneWeekAgo);
        const previousWeekData = sortedData.filter(row => row.timestamp >= twoWeeksAgo && row.timestamp < oneWeekAgo);
        
        const currentWeekRequests = currentWeekData.reduce((sum, row) => sum + row.requests, 0);
        const previousWeekRequests = previousWeekData.reduce((sum, row) => sum + row.requests, 0);
        
        const currentWeekUsers = new Set(currentWeekData.map(row => row.user)).size;
        const previousWeekUsers = new Set(previousWeekData.map(row => row.user)).size;
        
        const currentWeekAvgRequests = currentWeekUsers > 0 ? currentWeekRequests / currentWeekUsers : 0;
        const previousWeekAvgRequests = previousWeekUsers > 0 ? previousWeekRequests / previousWeekUsers : 0;
        
        // Calculate monthly trend data
        const currentMonthData = sortedData.filter(row => row.timestamp >= oneMonthAgo);
        const previousMonthData = sortedData.filter(row => row.timestamp >= twoMonthsAgo && row.timestamp < oneMonthAgo);
        
        const currentMonthRequests = currentMonthData.reduce((sum, row) => sum + row.requests, 0);
        const previousMonthRequests = previousMonthData.reduce((sum, row) => sum + row.requests, 0);
        
        const currentMonthUsers = new Set(currentMonthData.map(row => row.user)).size;
        const previousMonthUsers = new Set(previousMonthData.map(row => row.user)).size;
        
        const currentMonthAvgRequests = currentMonthUsers > 0 ? currentMonthRequests / currentMonthUsers : 0;
        const previousMonthAvgRequests = previousMonthUsers > 0 ? previousMonthRequests / previousMonthUsers : 0;
        
        // Calculate quarterly trend data
        const currentQuarterData = sortedData.filter(row => row.timestamp >= oneQuarterAgo);
        const previousQuarterData = sortedData.filter(row => row.timestamp >= twoQuartersAgo && row.timestamp < oneQuarterAgo);
        
        const currentQuarterRequests = currentQuarterData.reduce((sum, row) => sum + row.requests, 0);
        const previousQuarterRequests = previousQuarterData.reduce((sum, row) => sum + row.requests, 0);
        
        const currentQuarterUsers = new Set(currentQuarterData.map(row => row.user)).size;
        const previousQuarterUsers = new Set(previousQuarterData.map(row => row.user)).size;
        
        const currentQuarterAvgRequests = currentQuarterUsers > 0 ? currentQuarterRequests / currentQuarterUsers : 0;
        const previousQuarterAvgRequests = previousQuarterUsers > 0 ? previousQuarterRequests / previousQuarterUsers : 0;
        
        // Calculate daily data for charts
        const dailyData = this.calculateDailyData(sortedData, 30); // Last 30 days
        
        return {
            week: {
                totalRequests: { current: currentWeekRequests, previous: previousWeekRequests },
                activeUsers: { current: currentWeekUsers, previous: previousWeekUsers },
                avgRequests: { current: currentWeekAvgRequests, previous: previousWeekAvgRequests }
            },
            month: {
                totalRequests: { current: currentMonthRequests, previous: previousMonthRequests },
                activeUsers: { current: currentMonthUsers, previous: previousMonthUsers },
                avgRequests: { current: currentMonthAvgRequests, previous: previousMonthAvgRequests }
            },
            quarter: {
                totalRequests: { current: currentQuarterRequests, previous: previousQuarterRequests },
                activeUsers: { current: currentQuarterUsers, previous: previousQuarterUsers },
                avgRequests: { current: currentQuarterAvgRequests, previous: previousQuarterAvgRequests }
            },
            totalRequests: dailyData.totalRequests,
            activeUsers: dailyData.activeUsers,
            avgRequests: dailyData.avgRequests
        };
    }
    
    calculateDailyData(data, days) {
        // Get date range
        const now = new Date();
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        
        // Initialize arrays
        const totalRequests = [];
        const activeUsers = [];
        const avgRequests = [];
        
        // Create a date for each day in the range
        for (let i = 0; i <= days; i++) {
            const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split('T')[0];
            
            // Filter data for this day
            const dayData = data.filter(row => {
                const rowDate = row.timestamp.toISOString().split('T')[0];
                return rowDate === dateStr;
            });
            
            // Calculate metrics
            const dayRequests = dayData.reduce((sum, row) => sum + row.requests, 0);
            const uniqueUsers = new Set(dayData.map(row => row.user)).size;
            const avgRequestsPerUser = uniqueUsers > 0 ? dayRequests / uniqueUsers : 0;
            
            // Add to arrays
            totalRequests.push({ x: dateStr, y: dayRequests });
            activeUsers.push({ x: dateStr, y: uniqueUsers });
            avgRequests.push({ x: dateStr, y: avgRequestsPerUser });
        }
        
        return { totalRequests, activeUsers, avgRequests };
    }
    
    updateTrendValues(trendData) {
        // Get current period (default to week)
        const period = this.dashboardConfig.trendPeriod || 'week';
        const data = trendData[period];
        
        // Update total requests trend
        document.getElementById('totalRequestsTrend').textContent = data.totalRequests.current.toLocaleString();
        const totalRequestsChange = data.totalRequests.previous > 0 
            ? ((data.totalRequests.current - data.totalRequests.previous) / data.totalRequests.previous * 100).toFixed(1)
            : 0;
        document.getElementById('totalRequestsChange').textContent = `${totalRequestsChange}%`;
        document.getElementById('totalRequestsChange').parentNode.querySelector('.trend-indicator i').className = 
            totalRequestsChange >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
        
        // Update active users trend
        document.getElementById('activeUsersTrend').textContent = data.activeUsers.current.toLocaleString();
        const activeUsersChange = data.activeUsers.previous > 0 
            ? ((data.activeUsers.current - data.activeUsers.previous) / data.activeUsers.previous * 100).toFixed(1)
            : 0;
        document.getElementById('activeUsersChange').textContent = `${activeUsersChange}%`;
        document.getElementById('activeUsersChange').parentNode.querySelector('.trend-indicator i').className = 
            activeUsersChange >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
        
        // Update avg requests trend
        document.getElementById('avgRequestsTrend').textContent = data.avgRequests.current.toFixed(1);
        const avgRequestsChange = data.avgRequests.previous > 0 
            ? ((data.avgRequests.current - data.avgRequests.previous) / data.avgRequests.previous * 100).toFixed(1)
            : 0;
        document.getElementById('avgRequestsChange').textContent = `${avgRequestsChange}%`;
        document.getElementById('avgRequestsChange').parentNode.querySelector('.trend-indicator i').className = 
            avgRequestsChange >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
    }
    
    createMiniTrendChart(chartId, data) {
        const ctx = document.getElementById(chartId);
        if (!ctx) {
            console.error(`Canvas element with ID ${chartId} not found`);
            return;
        }
        
        const context = ctx.getContext('2d');
        
        if (this.charts[chartId]) {
            this.charts[chartId].destroy();
        }
        
        console.log(`Creating mini trend chart ${chartId} with ${data.length} data points`);
        if (data.length === 0) {
            console.warn(`No data for chart ${chartId}`);
        }
        
        const isDarkMode = document.body.classList.contains('dark-mode');
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDarkMode ? '#b8b8b8' : '#666';
        
        // Create a simple dataset if we don't have data
        const chartData = data.length > 0 ? data : [
            { x: '2023-01-01', y: 0 },
            { x: '2023-01-02', y: 0 }
        ];
        
        try {
            this.charts[chartId] = new Chart(context, {
                type: 'line',
                data: {
                    datasets: [{
                        data: chartData,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'day',
                                displayFormats: {
                                    day: 'MMM d'
                                }
                            },
                            grid: {
                                display: false
                            },
                            ticks: {
                                display: false
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: gridColor
                            },
                            ticks: {
                                color: textColor,
                                display: false
                            }
                        }
                    },
                    elements: {
                        point: {
                            radius: 0
                        }
                    }
                }
            });
            
            console.log(`Chart ${chartId} created successfully`);
        } catch (error) {
            console.error(`Error creating chart ${chartId}:`, error);
        }
    }
    
    updateTrendChart(chartId, period) {
        // Update the trend period
        this.dashboardConfig.trendPeriod = period;
        
        // Recalculate trend data
        const trendData = this.calculateTrendData();
        
        // Update trend values and indicators
        this.updateTrendValues(trendData);
        
        // Save setting
        localStorage.setItem('copilot-dashboard-config', JSON.stringify(this.dashboardConfig));
    }
    
    createActivityHeatmapFull() {
        const ctx = document.getElementById('activityHeatmapFull').getContext('2d');
        
        if (this.charts.activityHeatmapFull) {
            this.charts.activityHeatmapFull.destroy();
        }
        
        // Create day vs hour heatmap data
        const heatmapData = [];
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const hourLabels = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
        
        // Initialize the data structure
        for (let day = 0; day < 7; day++) {
            for (let hour = 0; hour < 24; hour++) {
                heatmapData.push({
                    x: hour,
                    y: day,
                    v: 0 // Value (request count)
                });
            }
        }
        
        // Populate with actual data
        this.filteredData.forEach(row => {
            const day = row.timestamp.getDay();
            const hour = row.timestamp.getHours();
            const index = day * 24 + hour;
            if (index < heatmapData.length) {
                heatmapData[index].v += row.requests;
            }
        });
        
        // Find max value for color scaling
        const maxValue = Math.max(...heatmapData.map(d => d.v));
        
        // Create color scale
        const getColor = (value) => {
            const intensity = maxValue > 0 ? value / maxValue : 0;
            return `rgba(102, 126, 234, ${intensity.toFixed(2)})`;
        };
        
        const isDarkMode = document.body.classList.contains('dark-mode');
        const textColor = isDarkMode ? '#b8b8b8' : '#666';
        
        this.charts.activityHeatmapFull = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    data: heatmapData.map(d => ({
                        x: d.x,
                        y: d.y,
                        value: d.v
                    })),
                    backgroundColor: heatmapData.map(d => getColor(d.v)),
                    pointRadius: 15,
                    pointHoverRadius: 18
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;
                                return `${dayNames[point.y]} at ${hourLabels[point.x]}: ${point.value.toLocaleString()} requests`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        min: -0.5,
                        max: 23.5,
                        ticks: {
                            callback: function(value) {
                                return hourLabels[value];
                            },
                            color: textColor,
                            maxRotation: 0,
                            autoSkip: true,
                            autoSkipPadding: 20
                        },
                        grid: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Hour of Day',
                            color: textColor
                        }
                    },
                    y: {
                        min: -0.5,
                        max: 6.5,
                        ticks: {
                            callback: function(value) {
                                return dayNames[value];
                            },
                            color: textColor
                        },
                        grid: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Day of Week',
                            color: textColor
                        }
                    }
                }
            }
        });
    }
    
    createModelComparisonChart() {
        const ctx = document.getElementById('modelComparisonChart').getContext('2d');
        
        if (this.charts.modelComparisonChart) {
            this.charts.modelComparisonChart.destroy();
        }
        
        // Calculate model efficiency metrics
        const modelStats = {};
        this.filteredData.forEach(row => {
            if (!modelStats[row.model]) {
                modelStats[row.model] = {
                    totalRequests: 0,
                    uniqueUsers: new Set(),
                    totalDays: new Set()
                };
            }
            modelStats[row.model].totalRequests += row.requests;
            modelStats[row.model].uniqueUsers.add(row.user);
            modelStats[row.model].totalDays.add(row.timestamp.toISOString().split('T')[0]);
        });
        
        // Calculate efficiency metrics
        const modelEfficiency = Object.entries(modelStats)
            .map(([model, stats]) => {
                const usersCount = stats.uniqueUsers.size;
                const daysCount = stats.totalDays.size;
                return {
                    model,
                    requests: stats.totalRequests,
                    users: usersCount,
                    requestsPerUser: usersCount > 0 ? stats.totalRequests / usersCount : 0,
                    requestsPerDay: daysCount > 0 ? stats.totalRequests / daysCount : 0,
                    usageScore: (usersCount * stats.totalRequests) / (daysCount || 1)
                };
            })
            .sort((a, b) => b.usageScore - a.usageScore)
            .slice(0, 8); // Top 8 models
        
        const labels = modelEfficiency.map(m => m.model);
        const requestsPerUser = modelEfficiency.map(m => m.requestsPerUser);
        const requestsPerDay = modelEfficiency.map(m => m.requestsPerDay);
        const totalRequests = modelEfficiency.map(m => m.requests);
        
        const isDarkMode = document.body.classList.contains('dark-mode');
        const textColor = isDarkMode ? '#b8b8b8' : '#666';
        
        this.charts.modelComparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Requests per User',
                        data: requestsPerUser,
                        backgroundColor: '#667eea',
                        borderColor: '#667eea',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Requests per Day',
                        data: requestsPerDay,
                        backgroundColor: '#764ba2',
                        borderColor: '#764ba2',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Total Requests',
                        data: totalRequests,
                        type: 'line',
                        borderColor: '#fd7e14',
                        backgroundColor: 'rgba(253, 126, 20, 0.2)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: textColor
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: textColor,
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Efficiency Metrics',
                            color: textColor
                        },
                        ticks: {
                            color: textColor
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Total Requests',
                            color: textColor
                        },
                        ticks: {
                            color: textColor
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });
    }
    
    createUsagePatternCharts() {
        this.createDailyDistributionChart();
        this.createHourlyDistributionChart();
        this.createTopModelsChart();
        this.createTopUsersChart();
    }
    
    createDailyDistributionChart() {
        const ctx = document.getElementById('dailyDistributionChart').getContext('2d');
        
        if (this.charts.dailyDistributionChart) {
            this.charts.dailyDistributionChart.destroy();
        }
        
        // Group data by day of week
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayData = new Array(7).fill(0);
        
        this.filteredData.forEach(row => {
            const dayOfWeek = row.timestamp.getDay();
            dayData[dayOfWeek] += row.requests;
        });
        
        const isDarkMode = document.body.classList.contains('dark-mode');
        const textColor = isDarkMode ? '#b8b8b8' : '#666';
        
        this.charts.dailyDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dayNames,
                datasets: [{
                    label: 'Requests',
                    data: dayData,
                    backgroundColor: '#4285f4',
                    borderColor: '#4285f4',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: textColor
                        }
                    },
                    x: {
                        ticks: {
                            color: textColor
                        }
                    }
                }
            }
        });
    }
    
    createHourlyDistributionChart() {
        const ctx = document.getElementById('hourlyDistributionChart').getContext('2d');
        
        if (this.charts.hourlyDistributionChart) {
            this.charts.hourlyDistributionChart.destroy();
        }
        
        // Group data by hour
        const hourData = new Array(24).fill(0);
        
        this.filteredData.forEach(row => {
            const hour = row.timestamp.getHours();
            hourData[hour] += row.requests;
        });
        
        const labels = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
        
        const isDarkMode = document.body.classList.contains('dark-mode');
        const textColor = isDarkMode ? '#b8b8b8' : '#666';
        
        this.charts.hourlyDistributionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Requests',
                    data: hourData,
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: textColor
                        }
                    },
                    x: {
                        ticks: {
                            color: textColor,
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: true,
                            autoSkipPadding: 10
                        }
                    }
                }
            }
        });
    }
    
    createTopModelsChart() {
        const ctx = document.getElementById('topModelsChart').getContext('2d');
        
        if (this.charts.topModelsChart) {
            this.charts.topModelsChart.destroy();
        }
        
        // Group data by model
        const modelData = {};
        this.filteredData.forEach(row => {
            modelData[row.model] = (modelData[row.model] || 0) + row.requests;
        });
        
        const sortedModels = Object.entries(modelData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
        
        const labels = sortedModels.map(([model]) => model);
        const values = sortedModels.map(([, count]) => count);
        
        const isDarkMode = document.body.classList.contains('dark-mode');
        const textColor = isDarkMode ? '#b8b8b8' : '#666';
        
        this.charts.topModelsChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: this.generateColors(labels.length),
                    borderWidth: 2,
                    borderColor: isDarkMode ? '#2a2d3e' : '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: textColor,
                            font: {
                                size: 10
                            }
                        }
                    }
                }
            }
        });
    }
    
    createTopUsersChart() {
        const ctx = document.getElementById('topUsersChart').getContext('2d');
        
        if (this.charts.topUsersChart) {
            this.charts.topUsersChart.destroy();
        }
        
        // Group data by user
        const userData = {};
        this.filteredData.forEach(row => {
            userData[row.user] = (userData[row.user] || 0) + row.requests;
        });
        
        const sortedUsers = Object.entries(userData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
        
        const labels = sortedUsers.map(([user]) => user);
        const values = sortedUsers.map(([, count]) => count);
        
        const isDarkMode = document.body.classList.contains('dark-mode');
        const textColor = isDarkMode ? '#b8b8b8' : '#666';
        
        this.charts.topUsersChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Requests',
                    data: values,
                    backgroundColor: '#f093fb',
                    borderColor: '#f093fb',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            color: textColor
                        }
                    },
                    y: {
                        ticks: {
                            color: textColor
                        }
                    }
                }
            }
        });
    }
    
    // Removed data aggregation options
    addAggregationOptions() {
        // Function kept for compatibility but no longer used
        return;
    }
    
    // Removed data aggregation functionality
    applyDataAggregation() {
        return;
    }
    
    // Removed data aggregation functionality
    aggregateDataByTime(timeAggregation) {
        return;
    }
    
    // Removed data aggregation functionality
    getDateOfWeek(weekNumber, year) {
        return new Date();
    }
    
    // Removed data aggregation functionality
    limitDataPoints(limit) {
        return;
    }

    populateFilters() {
        const users = [...new Set(this.rawData.map(row => row.user))].sort();
        const models = [...new Set(this.rawData.map(row => row.model))].sort();
        
        const userFilter = document.getElementById('userFilter');
        const modelFilter = document.getElementById('modelFilter');
        
        // Clear existing options (except "All")
        userFilter.innerHTML = '<option value="all">All Users</option>';
        modelFilter.innerHTML = '<option value="all">All Models</option>';
        
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user;
            option.textContent = user;
            userFilter.appendChild(option);
        });
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelFilter.appendChild(option);
        });
    }

    applyFilters() {
        console.log('Applying filters to', this.rawData.length, 'records');
        
        const dateRange = document.getElementById('dateRange').value;
        const userFilter = document.getElementById('userFilter').value;
        const modelFilter = document.getElementById('modelFilter').value;
        
        console.log('Filters:', { dateRange, userFilter, modelFilter });
        
        let filtered = [...this.rawData];
        
        // Date filter
        if (dateRange !== 'all') {
            const days = parseInt(dateRange);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            filtered = filtered.filter(row => row.timestamp >= cutoffDate);
            console.log(`Date filter applied (${days} days): ${filtered.length} records remaining`);
        }
        
        // User filter
        if (userFilter !== 'all') {
            filtered = filtered.filter(row => row.user === userFilter);
            console.log(`User filter applied (${userFilter}): ${filtered.length} records remaining`);
        }
        
        // Model filter
        if (modelFilter !== 'all') {
            filtered = filtered.filter(row => row.model === modelFilter);
            console.log(`Model filter applied (${modelFilter}): ${filtered.length} records remaining`);
        }
        
        this.filteredData = filtered;
        console.log('Filtered data:', this.filteredData.length, 'records');
        
        this.updateDashboard();
    }

    updateDashboard() {
        console.log('Updating dashboard with', this.filteredData.length, 'records');
        this.updateStatCards();
        this.updateCharts();
        this.updateTable();
    }

    updateStatCards() {
        const data = this.filteredData;
        
        const totalUsers = new Set(data.map(row => row.user)).size;
        const totalRequests = data.reduce((sum, row) => sum + row.requests, 0);
        const totalModels = new Set(data.map(row => row.model)).size;
        const avgRequestsPerUser = totalUsers > 0 ? Math.round(totalRequests / totalUsers) : 0;
        
        // Calculate daily average (average requests per unique day)
        const uniqueDays = new Set(data.map(row => row.timestamp.toDateString())).size;
        const dailyAverage = uniqueDays > 0 ? Math.round(totalRequests / uniqueDays) : 0;
        
        // Calculate peak hour
        const peakHour = this.calculatePeakHour(data);
        
        // Calculate weekly growth
        const weeklyGrowth = this.calculateWeeklyGrowth(data);
        
        // Calculate most active user
        const userStats = {};
        data.forEach(row => {
            userStats[row.user] = (userStats[row.user] || 0) + row.requests;
        });
        const mostActiveUser = Object.entries(userStats)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || '--';
        
        // Calculate top model
        const modelStats = {};
        data.forEach(row => {
            modelStats[row.model] = (modelStats[row.model] || 0) + row.requests;
        });
        const topModel = Object.entries(modelStats)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || '--';
        
        document.getElementById('totalUsers').textContent = totalUsers.toLocaleString();
        document.getElementById('totalRequests').textContent = totalRequests.toLocaleString();
        document.getElementById('totalModels').textContent = totalModels.toLocaleString();
        document.getElementById('avgRequestsPerUser').textContent = avgRequestsPerUser.toLocaleString();
        document.getElementById('dailyAverage').textContent = dailyAverage.toLocaleString();
        document.getElementById('peakHour').textContent = peakHour;
        document.getElementById('weeklyGrowth').textContent = weeklyGrowth;
        document.getElementById('mostActiveUser').textContent = mostActiveUser;
        document.getElementById('topModel').textContent = topModel.length > 20 ? topModel.substring(0, 17) + '...' : topModel;
    }

    generateColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = (i * 360 / count) % 360;
            colors.push(`hsla(${hue}, 70%, 60%, 0.8)`);
        }
        return colors;
    }



    calculatePeakHour(data) {
        const hourlyUsage = {};
        data.forEach(row => {
            const hour = row.timestamp.getHours();
            hourlyUsage[hour] = (hourlyUsage[hour] || 0) + row.requests;
        });

        let peakHour = 0;
        let maxUsage = 0;
        Object.entries(hourlyUsage).forEach(([hour, usage]) => {
            if (usage > maxUsage) {
                maxUsage = usage;
                peakHour = parseInt(hour);
            }
        });

        return `${peakHour.toString().padStart(2, '0')}:00`;
    }

    calculateWeeklyGrowth(data) {
        if (data.length === 0) return '0%';

        // Sort data by timestamp
        const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
        if (sortedData.length === 0) return '0%';

        // Get the date range from the actual data
        const firstDate = sortedData[0].timestamp;
        const lastDate = sortedData[sortedData.length - 1].timestamp;
        const totalDays = Math.ceil((lastDate - firstDate) / (24 * 60 * 60 * 1000));

        // If we don't have at least 14 days of data, calculate based on available data
        if (totalDays < 14) {
            const midPoint = Math.floor(sortedData.length / 2);
            const firstHalf = sortedData.slice(0, midPoint);
            const secondHalf = sortedData.slice(midPoint);
            
            const firstHalfTotal = firstHalf.reduce((sum, row) => sum + row.requests, 0);
            const secondHalfTotal = secondHalf.reduce((sum, row) => sum + row.requests, 0);
            
            if (firstHalfTotal === 0) return secondHalfTotal > 0 ? '+100%' : '0%';
            
            const growth = ((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100;
            return (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%';
        }

        // Use the last 14 days of actual data
        const twoWeeksAgo = new Date(lastDate.getTime() - 14 * 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(lastDate.getTime() - 7 * 24 * 60 * 60 * 1000);

        const thisWeek = sortedData.filter(row => row.timestamp >= oneWeekAgo).reduce((sum, row) => sum + row.requests, 0);
        const lastWeek = sortedData.filter(row => row.timestamp >= twoWeeksAgo && row.timestamp < oneWeekAgo).reduce((sum, row) => sum + row.requests, 0);

        if (lastWeek === 0) return thisWeek > 0 ? '+100%' : '0%';
        
        const growth = ((thisWeek - lastWeek) / lastWeek) * 100;
        return (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%';
    }

    updateCharts() {
        this.createTimelineChart();
        this.createModelChart();
        this.createModelBarChart();
        this.createUserChart();
        this.createModelTrendsChart();
        this.createDayOfWeekChart();
        this.createHourlyUsageChart();
        this.createActivityHeatmapChart();
        this.createCumulativeGrowthChart();
        this.createRequestSizeChart();
        this.createUserEfficiencyChart();
        this.createModelPerformanceChart();
    }

    createTimelineChart() {
        const ctx = document.getElementById('timelineChart').getContext('2d');
        
        // Destroy existing chart
        if (this.charts.timeline) {
            this.charts.timeline.destroy();
        }
        
        // Group data by date
        const dailyData = {};
        this.filteredData.forEach(row => {
            const date = row.timestamp.toISOString().split('T')[0];
            dailyData[date] = (dailyData[date] || 0) + row.requests;
        });
        
        const sortedDates = Object.keys(dailyData).sort();
        const values = sortedDates.map(date => dailyData[date]);
        
        this.charts.timeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Requests',
                    data: values,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createModelChart() {
        const ctx = document.getElementById('modelChart').getContext('2d');
        
        if (this.charts.model) {
            this.charts.model.destroy();
        }
        
        // Group data by model
        const modelData = {};
        this.filteredData.forEach(row => {
            modelData[row.model] = (modelData[row.model] || 0) + row.requests;
        });
        
        const sortedModels = Object.entries(modelData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
        
        const labels = sortedModels.map(([model]) => model);
        const values = sortedModels.map(([, count]) => count);
        
        this.charts.model = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: this.generateColors(labels.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                },
                onClick: (_, elements) => {
                    if (elements.length > 0) {
                        const element = elements[0];
                        const modelName = labels[element.index];
                        this.showModelDistributionDetails(modelName);
                    }
                }
            }
        });
    }

    createModelBarChart() {
        const ctx = document.getElementById('modelBarChart').getContext('2d');
        
        if (this.charts.modelBar) {
            this.charts.modelBar.destroy();
        }
        
        // Group data by model
        const modelData = {};
        this.filteredData.forEach(row => {
            modelData[row.model] = (modelData[row.model] || 0) + row.requests;
        });
        
        const sortedModels = Object.entries(modelData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
        
        const labels = sortedModels.map(([model]) => model);
        const values = sortedModels.map(([, count]) => count);
        
        this.charts.modelBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Requests',
                    data: values,
                    backgroundColor: '#667eea',
                    borderColor: '#667eea',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    }

    createUserChart() {
        const ctx = document.getElementById('userChart').getContext('2d');
        
        if (this.charts.user) {
            this.charts.user.destroy();
        }
        
        // Group data by user
        const userData = {};
        this.filteredData.forEach(row => {
            userData[row.user] = (userData[row.user] || 0) + row.requests;
        });
        
        const sortedUsers = Object.entries(userData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
        
        const labels = sortedUsers.map(([user]) => user);
        const values = sortedUsers.map(([, count]) => count);
        
        this.charts.user = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Requests',
                    data: values,
                    backgroundColor: '#f093fb',
                    borderColor: '#f093fb',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    }

    createModelTrendsChart() {
        const ctx = document.getElementById('modelTrendsChart').getContext('2d');
        
        if (this.charts.modelTrends) {
            this.charts.modelTrends.destroy();
        }
        
        // Get top 5 models by total usage
        const modelTotals = {};
        this.filteredData.forEach(row => {
            modelTotals[row.model] = (modelTotals[row.model] || 0) + row.requests;
        });
        
        const topModels = Object.entries(modelTotals)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([model]) => model);
        
        // Create datasets for each model
        const datasets = topModels.map((model, index) => {
            const modelData = {};
            this.filteredData
                .filter(row => row.model === model)
                .forEach(row => {
                    const date = row.timestamp.toISOString().split('T')[0];
                    modelData[date] = (modelData[date] || 0) + row.requests;
                });
            
            // Get all unique dates and ensure each model has data for all dates
            const allDates = [...new Set(this.filteredData.map(row => row.timestamp.toISOString().split('T')[0]))].sort();
            const values = allDates.map(date => modelData[date] || 0);
            
            return {
                label: model,
                data: values,
                borderColor: this.generateColors(topModels.length)[index],
                backgroundColor: this.generateColors(topModels.length)[index].replace('0.8)', '0.1)'),
                fill: false,
                tension: 0.4
            };
        });
        
        const allDates = [...new Set(this.filteredData.map(row => row.timestamp.toISOString().split('T')[0]))].sort();
        
        this.charts.modelTrends = new Chart(ctx, {
            type: 'line',
            data: {
                labels: allDates.map(date => new Date(date).toLocaleDateString()),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createDayOfWeekChart() {
        const ctx = document.getElementById('dayOfWeekChart').getContext('2d');
        
        if (this.charts.dayOfWeek) {
            this.charts.dayOfWeek.destroy();
        }
        
        // Group data by day of week
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayData = new Array(7).fill(0);
        
        this.filteredData.forEach(row => {
            const dayOfWeek = row.timestamp.getDay();
            dayData[dayOfWeek] += row.requests;
        });
        
        this.charts.dayOfWeek = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dayNames,
                datasets: [{
                    label: 'Requests',
                    data: dayData,
                    backgroundColor: '#4285f4',
                    borderColor: '#4285f4',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createHourlyUsageChart() {
        const ctx = document.getElementById('hourlyUsageChart').getContext('2d');
        
        if (this.charts.hourlyUsage) {
            this.charts.hourlyUsage.destroy();
        }
        
        // Group data by hour
        const hourData = new Array(24).fill(0);
        
        this.filteredData.forEach(row => {
            const hour = row.timestamp.getHours();
            hourData[hour] += row.requests;
        });
        
        const labels = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
        
        this.charts.hourlyUsage = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Requests',
                    data: hourData,
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createActivityHeatmapChart() {
        const ctx = document.getElementById('activityHeatmapChart').getContext('2d');
        
        if (this.charts.activityHeatmap) {
            this.charts.activityHeatmap.destroy();
        }
        
        // Create day vs hour heatmap data
        const heatmapData = {};
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        this.filteredData.forEach(row => {
            const day = row.timestamp.getDay();
            const hour = row.timestamp.getHours();
            const key = `${day}-${hour}`;
            heatmapData[key] = (heatmapData[key] || 0) + row.requests;
        });
        
        // Convert to chart.js format (simplified bar chart since heatmap requires additional library)
        const hourlyByDay = dayNames.map((_, dayIndex) => {
            let dayTotal = 0;
            for (let hour = 0; hour < 24; hour++) {
                dayTotal += heatmapData[`${dayIndex}-${hour}`] || 0;
            }
            return dayTotal;
        });
        
        this.charts.activityHeatmap = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dayNames,
                datasets: [{
                    label: 'Total Daily Activity',
                    data: hourlyByDay,
                    backgroundColor: '#34a853',
                    borderColor: '#34a853',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createCumulativeGrowthChart() {
        const ctx = document.getElementById('cumulativeGrowthChart').getContext('2d');
        
        if (this.charts.cumulativeGrowth) {
            this.charts.cumulativeGrowth.destroy();
        }
        
        // Group data by date and calculate cumulative sum
        const dailyData = {};
        this.filteredData.forEach(row => {
            const date = row.timestamp.toISOString().split('T')[0];
            dailyData[date] = (dailyData[date] || 0) + row.requests;
        });
        
        const sortedDates = Object.keys(dailyData).sort();
        let cumulative = 0;
        const cumulativeData = sortedDates.map(date => {
            cumulative += dailyData[date];
            return cumulative;
        });
        
        this.charts.cumulativeGrowth = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Cumulative Requests',
                    data: cumulativeData,
                    borderColor: '#9c27b0',
                    backgroundColor: 'rgba(156, 39, 176, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createRequestSizeChart() {
        const ctx = document.getElementById('requestSizeChart').getContext('2d');
        
        if (this.charts.requestSize) {
            this.charts.requestSize.destroy();
        }
        
        // Group requests by size categories
        const sizeCategories = {
            'Small (1)': 0,
            'Medium (2-5)': 0,
            'Large (6-10)': 0,
            'Extra Large (11+)': 0
        };
        
        this.filteredData.forEach(row => {
            if (row.requests === 1) {
                sizeCategories['Small (1)']++;
            } else if (row.requests <= 5) {
                sizeCategories['Medium (2-5)']++;
            } else if (row.requests <= 10) {
                sizeCategories['Large (6-10)']++;
            } else {
                sizeCategories['Extra Large (11+)']++;
            }
        });
        
        const labels = Object.keys(sizeCategories);
        const values = Object.values(sizeCategories);
        
        this.charts.requestSize = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#4caf50', '#ff9800', '#f44336', '#9c27b0'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    createUserEfficiencyChart() {
        const ctx = document.getElementById('userEfficiencyChart').getContext('2d');
        
        if (this.charts.userEfficiency) {
            this.charts.userEfficiency.destroy();
        }
        
        // Calculate efficiency metrics (requests per day active)
        const userEfficiency = {};
        this.filteredData.forEach(row => {
            if (!userEfficiency[row.user]) {
                userEfficiency[row.user] = {
                    totalRequests: 0,
                    activeDays: new Set()
                };
            }
            userEfficiency[row.user].totalRequests += row.requests;
            userEfficiency[row.user].activeDays.add(row.timestamp.toDateString());
        });
        
        const efficiencyData = Object.entries(userEfficiency)
            .map(([user, data]) => ({
                user,
                efficiency: data.totalRequests / data.activeDays.size
            }))
            .sort((a, b) => b.efficiency - a.efficiency)
            .slice(0, 10);
        
        const labels = efficiencyData.map(item => item.user);
        const values = efficiencyData.map(item => item.efficiency);
        
        this.charts.userEfficiency = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Requests per Active Day',
                    data: values,
                    backgroundColor: '#17a2b8',
                    borderColor: '#17a2b8',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(1);
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    }

    createModelPerformanceChart() {
        const ctx = document.getElementById('modelPerformanceChart').getContext('2d');
        
        if (this.charts.modelPerformance) {
            this.charts.modelPerformance.destroy();
        }
        
        // Calculate model usage frequency and user adoption
        const modelStats = {};
        this.filteredData.forEach(row => {
            if (!modelStats[row.model]) {
                modelStats[row.model] = {
                    totalRequests: 0,
                    uniqueUsers: new Set(),
                    totalSessions: 0
                };
            }
            modelStats[row.model].totalRequests += row.requests;
            modelStats[row.model].uniqueUsers.add(row.user);
        });
        
        const performanceData = Object.entries(modelStats)
            .map(([model, stats]) => ({
                model,
                adoptionRate: stats.uniqueUsers.size,
                avgRequestsPerUser: stats.totalRequests / stats.uniqueUsers.size
            }))
            .sort((a, b) => b.adoptionRate - a.adoptionRate)
            .slice(0, 8);
        
        this.charts.modelPerformance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Model Performance',
                    data: performanceData.map(item => ({
                        x: item.adoptionRate,
                        y: item.avgRequestsPerUser,
                        label: item.model
                    })),
                    backgroundColor: '#fd7e14',
                    borderColor: '#fd7e14',
                    pointRadius: 8,
                    pointHoverRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;
                                return `${point.label}: ${point.x} users, ${point.y.toFixed(1)} avg requests/user`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'User Adoption (# of Users)'
                        },
                        beginAtZero: true
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Avg Requests per User'
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    updateTable() {
        const tbody = document.getElementById('dataTableBody');
        tbody.innerHTML = '';
        
        // Sort by timestamp (newest first)
        const sortedData = [...this.filteredData].sort((a, b) => b.timestamp - a.timestamp);
        
        // Calculate total pages
        this.totalPages = Math.ceil(sortedData.length / this.rowsPerPage);
        
        // Get current page data
        const startIndex = (this.currentPage - 1) * this.rowsPerPage;
        const endIndex = Math.min(startIndex + this.rowsPerPage, sortedData.length);
        const currentPageData = sortedData.slice(startIndex, endIndex);
        
        // Render current page data
        currentPageData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.timestamp.toLocaleString()}</td>
                <td>${row.user}</td>
                <td>${row.model}</td>
                <td>${row.requests.toLocaleString()}</td>
                <td>${row.exceedsQuota ? 'Yes' : 'No'}</td>
                <td>${row.quota}</td>
            `;
            tbody.appendChild(tr);
        });
        
        // Update pagination controls
        this.updatePaginationControls('dataTable');
    }
    
    updatePaginationControls(tableId) {
        // Find or create pagination container
        let paginationContainer = document.getElementById(`${tableId}-pagination`);
        if (!paginationContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = `${tableId}-pagination`;
            paginationContainer.className = 'pagination-controls';
            
            // Find table container and append pagination after it
            const tableContainer = document.querySelector(`.table-container:has(#${tableId})`);
            if (tableContainer) {
                tableContainer.insertAdjacentElement('afterend', paginationContainer);
            }
        }
        
        // Clear existing pagination controls
        paginationContainer.innerHTML = '';
        
        // Don't show pagination if only one page
        if (this.totalPages <= 1) {
            return;
        }
        
        // Create pagination HTML
        let paginationHTML = `
            <div class="pagination-info">Showing ${(this.currentPage - 1) * this.rowsPerPage + 1} to ${Math.min(this.currentPage * this.rowsPerPage, this.filteredData.length)} of ${this.filteredData.length} entries</div>
            <div class="pagination-buttons">
        `;
        
        // Previous button
        paginationHTML += `
            <button class="pagination-btn ${this.currentPage === 1 ? 'disabled' : ''}" 
                    ${this.currentPage === 1 ? 'disabled' : 'data-page="' + (this.currentPage - 1) + '"'}>
                &laquo; Previous
            </button>
        `;
        
        // Page buttons
        const maxButtons = 5;
        const startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
        const endPage = Math.min(this.totalPages, startPage + maxButtons - 1);
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="pagination-btn page-number ${i === this.currentPage ? 'active' : ''}" 
                        data-page="${i}">
                    ${i}
                </button>
            `;
        }
        
        // Next button
        paginationHTML += `
            <button class="pagination-btn ${this.currentPage === this.totalPages ? 'disabled' : ''}" 
                    ${this.currentPage === this.totalPages ? 'disabled' : 'data-page="' + (this.currentPage + 1) + '"'}>
                Next &raquo;
            </button>
        `;
        
        paginationHTML += `</div>`;
        
        // Add rows per page selector
        paginationHTML += `
            <div class="rows-per-page">
                <label for="rowsPerPage">Rows per page:</label>
                <select id="rowsPerPage">
                    <option value="10" ${this.rowsPerPage === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${this.rowsPerPage === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${this.rowsPerPage === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${this.rowsPerPage === 100 ? 'selected' : ''}>100</option>
                </select>
            </div>
        `;
        
        // Set the HTML
        paginationContainer.innerHTML = paginationHTML;
        
        // Add event listener to rows per page selector
        const rowsPerPageSelect = document.getElementById('rowsPerPage');
        if (rowsPerPageSelect) {
            rowsPerPageSelect.addEventListener('change', (e) => {
                this.rowsPerPage = parseInt(e.target.value);
                this.currentPage = 1; // Reset to first page
                this.updateTable();
            });
        }
    }
    
    goToPage(page) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.updateTable();
        }
    }

    filterTable() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const rows = document.querySelectorAll('#dataTableBody tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    }

    setupModalEventListeners() {
        const modals = document.querySelectorAll('.modal');
        
        modals.forEach(modal => {
            const closeBtn = modal.querySelector('.close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    modal.style.display = 'none';
                });
            }
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            modals.forEach(modal => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    setupStatCardListeners() {
        // Handle stat card clicks for modals
        document.querySelectorAll('.stat-card.clickable').forEach(card => {
            const modalId = card.getAttribute('data-modal');
            if (modalId) {
                card.addEventListener('click', () => {
                    const modal = document.getElementById(modalId);
                    if (modal) {
                        modal.style.display = 'block';
                        this.populateModal(modalId);
                    }
                });
            }
        });

        // Handle chart card clicks for modals
        document.querySelectorAll('.chart-card.clickable').forEach(card => {
            const modalId = card.getAttribute('data-modal');
            if (modalId) {
                card.addEventListener('click', () => {
                    const modal = document.getElementById(modalId);
                    if (modal) {
                        modal.style.display = 'block';
                        this.populateModal(modalId);
                    }
                });
            }
        });
    }

    showQuotaDistributionDetails(category) {
        const modal = document.getElementById('quota-distribution-modal');
        const detailsDiv = document.getElementById('quotaDistributionDetails');
        
        // Filter users by category
        let filteredUsers = [];
        if (category === 'Normal (0-80%)') {
            filteredUsers = this.filteredQuotaData.filter(row => row.usagePercentage <= 80);
        } else if (category === 'Near Quota (80-100%)') {
            filteredUsers = this.filteredQuotaData.filter(row => row.usagePercentage > 80 && row.usagePercentage <= 100);
        } else if (category === 'Over Quota (>100%)') {
            filteredUsers = this.filteredQuotaData.filter(row => row.usagePercentage > 100);
        }
        
        // Sort by usage percentage
        filteredUsers.sort((a, b) => b.usagePercentage - a.usagePercentage);
        
        // Create table HTML
        let tableHTML = `
            <h4>Users in Category: ${category}</h4>
            <p>Total Users: ${filteredUsers.length}</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e1e1e1;">User</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e1e1e1;">Requests</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e1e1e1;">Quota</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e1e1e1;">Usage %</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e1e1e1;">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        filteredUsers.forEach(user => {
            const statusClass = user.usagePercentage > 100 ? 'color: #dc3545;' : 
                              user.usagePercentage > 80 ? 'color: #ffc107;' : 'color: #28a745;';
            tableHTML += `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e1e1e1;">${user.user}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e1e1e1;">${user.totalRequests.toLocaleString()}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e1e1e1;">${user.monthlyQuota.toLocaleString()}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e1e1e1; ${statusClass}">${user.usagePercentage.toFixed(1)}%</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e1e1e1; ${statusClass}">${user.status}</td>
                </tr>
            `;
        });
        
        tableHTML += `
                </tbody>
            </table>
        `;
        
        detailsDiv.innerHTML = tableHTML;
        modal.style.display = 'block';
    }

    showModelDistributionDetails(modelName) {
        const modal = document.getElementById('model-distribution-modal');
        const detailsDiv = document.getElementById('modelDistributionDetails');
        
        // Get users for this model
        const modelUsers = {};
        this.filteredData
            .filter(row => row.model === modelName)
            .forEach(row => {
                modelUsers[row.user] = (modelUsers[row.user] || 0) + row.requests;
            });
        
        const sortedUsers = Object.entries(modelUsers)
            .sort(([,a], [,b]) => b - a);
        
        const totalModelRequests = sortedUsers.reduce((sum, [, requests]) => sum + requests, 0);
        
        // Create table HTML
        let tableHTML = `
            <h4>Users for Model: ${modelName}</h4>
            <p>Total Requests: ${totalModelRequests.toLocaleString()}</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e1e1e1;">User</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e1e1e1;">Requests</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e1e1e1;">% of Model Usage</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        sortedUsers.forEach(([user, requests]) => {
            const percentage = ((requests / totalModelRequests) * 100).toFixed(1);
            tableHTML += `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e1e1e1;">${user}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e1e1e1;">${requests.toLocaleString()}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e1e1e1;">${percentage}%</td>
                </tr>
            `;
        });
        
        tableHTML += `
                </tbody>
            </table>
        `;
        
        detailsDiv.innerHTML = tableHTML;
        modal.style.display = 'block';
    }

    populateModal(modalId) {
        switch(modalId) {
            case 'quota-users-modal':
                this.populateQuotaUsersModal();
                break;
            case 'quota-breakdown-modal':
                this.populateQuotaBreakdownModal();
                break;
            case 'quota-distribution-modal':
                // This is handled by chart click
                break;
            case 'quota-near-limit-modal':
                this.populateQuotaNearLimitModal();
                break;
            case 'quota-over-limit-modal':
                this.populateQuotaOverLimitModal();
                break;
            case 'users-modal':
                this.populateUsersModal();
                break;
            case 'models-modal':
                this.populateModelsModal();
                break;
            case 'model-distribution-modal':
                // This is handled by chart click
                break;
        }
    }

    populateQuotaUsersModal() {
        const tbody = document.getElementById('quotaUsersDetailTableBody');
        tbody.innerHTML = '';

        const sortedData = [...this.filteredQuotaData]
            .sort((a, b) => b.usagePercentage - a.usagePercentage);

        sortedData.forEach(row => {
            const tr = document.createElement('tr');
            const statusClass = row.usagePercentage > 100 ? 'quota-exceeded' : 'quota-normal';
            
            tr.innerHTML = `
                <td>${row.user}</td>
                <td>${row.totalRequests.toLocaleString()}</td>
                <td>${row.monthlyQuota.toLocaleString()}</td>
                <td class="${statusClass}">${row.usagePercentage.toFixed(1)}%</td>
                <td class="${statusClass}">${row.status}</td>
                <td>${row.remainingQuota.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    populateQuotaBreakdownModal() {
        const tbody = document.getElementById('quotaBreakdownDetailTableBody');
        tbody.innerHTML = '';

        const sortedData = [...this.filteredQuotaData]
            .sort((a, b) => b.totalRequests - a.totalRequests);

        sortedData.forEach(row => {
            const tr = document.createElement('tr');
            const statusClass = row.usagePercentage > 100 ? 'quota-exceeded' : 'quota-normal';
            
            tr.innerHTML = `
                <td>${row.user}</td>
                <td>${row.quotaBreakdown.normal.toLocaleString()}</td>
                <td>${row.quotaBreakdown.exceeding.toLocaleString()}</td>
                <td>${row.totalRequests.toLocaleString()}</td>
                <td class="${statusClass}">${row.usagePercentage.toFixed(1)}%</td>
            `;
            tbody.appendChild(tr);
        });
    }

    populateUsersModal() {
        // Implementation for users modal
        const tbody = document.getElementById('usersDetailTableBody');
        if (!tbody) return;

        const userStats = {};
        this.filteredData.forEach(row => {
            if (!userStats[row.user]) {
                userStats[row.user] = {
                    requests: 0,
                    models: new Set()
                };
            }
            userStats[row.user].requests += row.requests;
            userStats[row.user].models.add(row.model);
        });

        const totalRequests = this.filteredData.reduce((sum, row) => sum + row.requests, 0);
        const sortedUsers = Object.entries(userStats)
            .sort(([,a], [,b]) => b.requests - a.requests);

        tbody.innerHTML = '';
        sortedUsers.forEach(([user, stats]) => {
            const percentage = ((stats.requests / totalRequests) * 100).toFixed(1);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user}</td>
                <td>${stats.requests.toLocaleString()}</td>
                <td>${percentage}%</td>
            `;
            tbody.appendChild(tr);
        });
    }

    populateModelsModal() {
        // Implementation for models modal  
        const tbody = document.getElementById('modelsDetailTableBody');
        if (!tbody) return;

        const modelStats = {};
        this.filteredData.forEach(row => {
            modelStats[row.model] = (modelStats[row.model] || 0) + row.requests;
        });

        const totalRequests = this.filteredData.reduce((sum, row) => sum + row.requests, 0);
        const sortedModels = Object.entries(modelStats)
            .sort(([,a], [,b]) => b - a);

        tbody.innerHTML = '';
        sortedModels.forEach(([model, requests]) => {
            const percentage = ((requests / totalRequests) * 100).toFixed(1);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${model}</td>
                <td>${requests.toLocaleString()}</td>
                <td>${percentage}%</td>
            `;
            tbody.appendChild(tr);
        });
    }

    exportFilteredData() {
        if (this.filteredData.length === 0) {
            alert('No data to export');
            return;
        }
        
        const headers = ['Timestamp', 'User', 'Model', 'Requests', 'Exceeds Quota', 'Quota'];
        const csvContent = [
            headers.join(','),
            ...this.filteredData.map(row => [
                row.timestamp.toISOString(),
                row.user,
                row.model,
                row.requests,
                row.exceedsQuota ? 'TRUE' : 'FALSE',
                row.quota
            ].join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `copilot-usage-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    setupTabEventListeners() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });
    }

    switchTab(tabId) {
        console.log('Switching to tab:', tabId);
        
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');

        this.currentTab = tabId;

        // Update charts when switching tabs
        console.log('Refreshing data for tab:', tabId);
        if (tabId === 'quota-dashboard') {
            this.updateQuotaDashboard();
        } else if (tabId === 'usage-dashboard') {
            this.updateDashboard();
        }
    }

    processQuotaData() {
        // Calculate quota usage for each user
        const userQuotaData = {};
        
        console.log('Processing quota data from rawData:', this.rawData.length, 'records');
        
        this.rawData.forEach(row => {
            const user = row.user;
            const quota = parseInt(row.quota) || 0;
            const requests = row.requests;
            const model = row.model.toLowerCase();
            
            // Skip GPT-4.1* and GPT-4.0* variations - they don't count towards quota
            if (model.includes('gpt-4.1') || model.includes('gpt-4.0')) {
                console.log(`Excluding from quota: ${row.model} for user ${user}`);
                return; // Skip this row - don't count towards quota
            }
            
            if (!userQuotaData[user]) {
                userQuotaData[user] = {
                    user: user,
                    totalRequests: 0,
                    monthlyQuota: quota,
                    exceedsQuotaRequests: 0,
                    timestamps: [],
                    quotaBreakdown: {
                        normal: 0,
                        exceeding: 0
                    }
                };
            }
            
            userQuotaData[user].totalRequests += requests;
            userQuotaData[user].timestamps.push(row.timestamp);
        });

        // Now calculate breakdown based on actual quota usage
        Object.values(userQuotaData).forEach(userData => {
            const isOverQuota = userData.totalRequests > userData.monthlyQuota;
            
            if (isOverQuota) {
                // User exceeded quota - some requests are normal, some exceeding
                userData.quotaBreakdown.normal = userData.monthlyQuota;
                userData.quotaBreakdown.exceeding = userData.totalRequests - userData.monthlyQuota;
                userData.exceedsQuotaRequests = userData.quotaBreakdown.exceeding;
            } else {
                // User is within quota - all requests are normal
                userData.quotaBreakdown.normal = userData.totalRequests;
                userData.quotaBreakdown.exceeding = 0;
                userData.exceedsQuotaRequests = 0;
            }
        });

        // Convert to array and calculate usage percentages
        this.quotaData = Object.values(userQuotaData).map(userData => {
            const usagePercentage = userData.monthlyQuota > 0 
                ? (userData.totalRequests / userData.monthlyQuota) * 100 
                : 0;
            
            return {
                ...userData,
                usagePercentage: usagePercentage,
                status: usagePercentage > 100 ? 'Over Quota' : 
                       usagePercentage > 80 ? 'Near Quota' : 'Normal',
                remainingQuota: Math.max(0, userData.monthlyQuota - userData.totalRequests)
            };
        });

        // Populate quota filters
        this.populateQuotaFilters();
        
        console.log('Processed quota data:', this.quotaData.length, 'users');
        console.log('Sample processed data:', this.quotaData.slice(0, 3));
    }

    populateQuotaFilters() {
        const users = [...new Set(this.quotaData.map(row => row.user))].sort();
        
        const userFilter = document.getElementById('quotaUserFilter');
        
        // Clear existing options (except "All")
        userFilter.innerHTML = '<option value="all">All Users</option>';
        
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user;
            option.textContent = user;
            userFilter.appendChild(option);
        });
    }

    applyQuotaFilters() {
        const dateRange = document.getElementById('quotaDateRange').value;
        const userFilter = document.getElementById('quotaUserFilter').value;
        
        let filtered = [...this.quotaData];
        
        // User filter
        if (userFilter !== 'all') {
            filtered = filtered.filter(row => row.user === userFilter);
        }
        
        // Date filter - filter based on timestamps
        if (dateRange !== 'all') {
            const days = parseInt(dateRange);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            filtered = filtered.filter(userData => {
                return userData.timestamps.some(timestamp => timestamp >= cutoffDate);
            });
        }
        
        this.filteredQuotaData = filtered;
        console.log('Filtered quota data:', filtered.length, 'users');
        this.updateQuotaDashboard();
    }

    updateQuotaDashboard() {
        console.log('updateQuotaDashboard called, currentTab:', this.currentTab);
        if (this.currentTab !== 'quota-dashboard') return;
        
        console.log('Updating quota dashboard...');
        this.updateQuotaStatCards();
        this.updateQuotaCharts();
        this.updateQuotaTable();
    }

    updateQuotaStatCards() {
        const data = this.filteredQuotaData;
        
        console.log('Quota data length:', data.length);
        console.log('Sample quota data:', data.slice(0, 3));
        
        const totalUsers = data.length;
        const usersOverQuota = data.filter(row => row.usagePercentage > 100).length;
        const usersNearLimit = data.filter(row => row.usagePercentage > 80 && row.usagePercentage <= 100).length;
        const averageUsage = totalUsers > 0 
            ? (data.reduce((sum, row) => sum + row.usagePercentage, 0) / totalUsers).toFixed(1)
            : 0;
        
        document.getElementById('quotaTotalUsers').textContent = totalUsers.toLocaleString();
        document.getElementById('quotaAverageUsage').textContent = averageUsage + '%';
        document.getElementById('quotaNearLimitUsers').textContent = usersNearLimit.toLocaleString();
        document.getElementById('quotaOverLimitUsers').textContent = usersOverQuota.toLocaleString();
    }

    updateQuotaCharts() {
        this.createQuotaUsageChart();
        this.createQuotaDistributionChart();
        this.createQuotaBreakdownChart();
        this.createQuotaTimelineChart();
    }

    createQuotaUsageChart() {
        const ctx = document.getElementById('quotaUsageChart').getContext('2d');
        
        if (this.charts.quotaUsage) {
            this.charts.quotaUsage.destroy();
        }
        
        // Sort users by usage percentage (highest first) and take top 10
        const sortedData = [...this.filteredQuotaData]
            .sort((a, b) => b.usagePercentage - a.usagePercentage)
            .slice(0, 10);
        
        const labels = sortedData.map(row => row.user);
        const usageData = sortedData.map(row => row.usagePercentage);
        const colors = usageData.map(usage => {
            if (usage > 100) return '#dc3545'; // Red for over quota
            if (usage > 80) return '#ffc107';  // Yellow for near quota
            return '#28a745'; // Green for normal
        });
        
        this.charts.quotaUsage = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quota Usage %',
                    data: usageData,
                    backgroundColor: colors,
                    borderColor: colors.map(color => color.replace('0.8', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Usage: ${context.parsed.y.toFixed(1)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    createQuotaDistributionChart() {
        const ctx = document.getElementById('quotaDistributionChart').getContext('2d');
        
        if (this.charts.quotaDistribution) {
            this.charts.quotaDistribution.destroy();
        }
        
        // Categorize users by usage
        const categories = {
            'Normal (0-80%)': 0,
            'Near Quota (80-100%)': 0,
            'Over Quota (>100%)': 0
        };
        
        this.filteredQuotaData.forEach(row => {
            if (row.usagePercentage > 100) {
                categories['Over Quota (>100%)']++;
            } else if (row.usagePercentage > 80) {
                categories['Near Quota (80-100%)']++;
            } else {
                categories['Normal (0-80%)']++;
            }
        });
        
        const labels = Object.keys(categories);
        const values = Object.values(categories);
        const colors = ['#28a745', '#ffc107', '#dc3545'];
        
        this.charts.quotaDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                },
                onClick: (_, elements) => {
                    if (elements.length > 0) {
                        const element = elements[0];
                        const category = labels[element.index];
                        this.showQuotaDistributionDetails(category);
                    }
                }
            }
        });
    }

    createQuotaBreakdownChart() {
        const ctx = document.getElementById('quotaBreakdownChart').getContext('2d');
        
        if (this.charts.quotaBreakdown) {
            this.charts.quotaBreakdown.destroy();
        }
        
        // Get top 10 users by total requests
        const topUsers = [...this.filteredQuotaData]
            .sort((a, b) => b.totalRequests - a.totalRequests)
            .slice(0, 10);
        
        const labels = topUsers.map(user => user.user);
        const normalRequests = topUsers.map(user => user.quotaBreakdown.normal);
        const exceedingRequests = topUsers.map(user => user.quotaBreakdown.exceeding);
        
        this.charts.quotaBreakdown = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Normal Requests',
                        data: normalRequests,
                        backgroundColor: '#28a745',
                        borderColor: '#28a745',
                        borderWidth: 1
                    },
                    {
                        label: 'Exceeding Quota',
                        data: exceedingRequests,
                        backgroundColor: '#dc3545',
                        borderColor: '#dc3545',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toLocaleString()} requests`;
                            }
                        }
                    }
                }
            }
        });
    }

    createQuotaTimelineChart() {
        const ctx = document.getElementById('quotaTimelineChart').getContext('2d');
        
        if (this.charts.quotaTimeline) {
            this.charts.quotaTimeline.destroy();
        }
        
        // Get top 5 users by usage percentage for timeline
        const topUsers = [...this.filteredQuotaData]
            .sort((a, b) => b.usagePercentage - a.usagePercentage)
            .slice(0, 5);
        
        // Generate date range for last 30 days
        const dateRange = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dateRange.push(date.toISOString().split('T')[0]);
        }
        
        // Create datasets for each top user
        const datasets = topUsers.map((userData, index) => {
            const color = this.generateColors(topUsers.length)[index];
            
            // Calculate daily usage for this user
            const dailyUsage = dateRange.map(date => {
                const dayRequests = this.rawData
                    .filter(row => row.user === userData.user && 
                                  row.timestamp.toISOString().split('T')[0] === date)
                    .reduce((sum, row) => sum + row.requests, 0);
                
                return userData.monthlyQuota > 0 ? (dayRequests / userData.monthlyQuota) * 100 : 0;
            });
            
            return {
                label: userData.user,
                data: dailyUsage,
                borderColor: color,
                backgroundColor: color.replace('0.8)', '0.1)'),
                fill: false,
                tension: 0.4
            };
        });
        
        this.charts.quotaTimeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dateRange.map(date => new Date(date).toLocaleDateString()),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    updateQuotaTable() {
        const tbody = document.getElementById('quotaTableBody');
        tbody.innerHTML = '';
        
        // Sort by usage percentage (highest first)
        const sortedData = [...this.filteredQuotaData]
            .sort((a, b) => b.usagePercentage - a.usagePercentage);
        
        // Calculate total pages
        this.totalQuotaPages = Math.ceil(sortedData.length / this.rowsPerPage);
        
        // Get current page data
        const startIndex = ((this.currentQuotaPage || 1) - 1) * this.rowsPerPage;
        const endIndex = Math.min(startIndex + this.rowsPerPage, sortedData.length);
        const currentPageData = sortedData.slice(startIndex, endIndex);
        
        // Render current page data
        currentPageData.forEach(row => {
            const tr = document.createElement('tr');
            const statusClass = row.usagePercentage > 100 ? 'quota-exceeded' : 'quota-normal';
            
            tr.innerHTML = `
                <td>${row.user}</td>
                <td>${row.totalRequests.toLocaleString()}</td>
                <td>${row.monthlyQuota.toLocaleString()}</td>
                <td class="${statusClass}">${row.usagePercentage.toFixed(1)}%</td>
                <td class="${statusClass}">${row.status}</td>
                <td>${row.exceedsQuotaRequests.toLocaleString()}</td>
                <td>${row.remainingQuota.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
        
        // Update pagination controls
        this.updateQuotaPaginationControls('quotaTable');
    }
    
    updateQuotaPaginationControls(tableId) {
        // Find or create pagination container
        let paginationContainer = document.getElementById(`${tableId}-pagination`);
        if (!paginationContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = `${tableId}-pagination`;
            paginationContainer.className = 'pagination-controls';
            
            // Find table container and append pagination after it
            const tableContainer = document.querySelector(`.table-container:has(#${tableId})`);
            if (tableContainer) {
                tableContainer.insertAdjacentElement('afterend', paginationContainer);
            }
        }
        
        // Clear existing pagination controls
        paginationContainer.innerHTML = '';
        
        // Don't show pagination if only one page
        if (this.totalQuotaPages <= 1) {
            return;
        }
        
        // Create pagination HTML
        let paginationHTML = `
            <div class="pagination-info">Showing ${((this.currentQuotaPage || 1) - 1) * this.rowsPerPage + 1} to ${Math.min((this.currentQuotaPage || 1) * this.rowsPerPage, this.filteredQuotaData.length)} of ${this.filteredQuotaData.length} entries</div>
            <div class="pagination-buttons">
        `;
        
        // Previous button
        paginationHTML += `
            <button class="pagination-btn quota-page ${(this.currentQuotaPage || 1) === 1 ? 'disabled' : ''}" 
                    ${(this.currentQuotaPage || 1) === 1 ? 'disabled' : 'data-page="' + ((this.currentQuotaPage || 1) - 1) + '"'}>
                &laquo; Previous
            </button>
        `;
        
        // Page buttons
        const maxButtons = 5;
        const startPage = Math.max(1, (this.currentQuotaPage || 1) - Math.floor(maxButtons / 2));
        const endPage = Math.min(this.totalQuotaPages, startPage + maxButtons - 1);
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="pagination-btn quota-page page-number ${i === (this.currentQuotaPage || 1) ? 'active' : ''}" 
                        data-page="${i}">
                    ${i}
                </button>
            `;
        }
        
        // Next button
        paginationHTML += `
            <button class="pagination-btn quota-page ${(this.currentQuotaPage || 1) === this.totalQuotaPages ? 'disabled' : ''}" 
                    ${(this.currentQuotaPage || 1) === this.totalQuotaPages ? 'disabled' : 'data-page="' + ((this.currentQuotaPage || 1) + 1) + '"'}>
                Next &raquo;
            </button>
        `;
        
        paginationHTML += `</div>`;
        
        // Add rows per page selector
        paginationHTML += `
            <div class="rows-per-page">
                <label for="quotaRowsPerPage">Rows per page:</label>
                <select id="quotaRowsPerPage">
                    <option value="10" ${this.rowsPerPage === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${this.rowsPerPage === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${this.rowsPerPage === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${this.rowsPerPage === 100 ? 'selected' : ''}>100</option>
                </select>
            </div>
        `;
        
        // Set the HTML
        paginationContainer.innerHTML = paginationHTML;
        
        // Add event listener to rows per page selector
        const rowsPerPageSelect = document.getElementById('quotaRowsPerPage');
        if (rowsPerPageSelect) {
            rowsPerPageSelect.addEventListener('change', (e) => {
                this.rowsPerPage = parseInt(e.target.value);
                this.currentQuotaPage = 1; // Reset to first page
                this.updateQuotaTable();
            });
        }
        
        // Add event listeners for quota pagination buttons
        document.querySelectorAll('.pagination-btn.quota-page').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!e.target.classList.contains('disabled')) {
                    const page = parseInt(e.target.dataset.page);
                    this.goToQuotaPage(page);
                }
            });
        });
    }
    
    goToQuotaPage(page) {
        if (page >= 1 && page <= this.totalQuotaPages) {
            this.currentQuotaPage = page;
            this.updateQuotaTable();
        }
    }

    filterQuotaTable() {
        const searchTerm = document.getElementById('quotaSearchInput').value.toLowerCase();
        const rows = document.querySelectorAll('#quotaTableBody tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    }

    exportQuotaData() {
        if (this.filteredQuotaData.length === 0) {
            alert('No quota data to export');
            return;
        }
        
        const headers = ['User', 'Total Requests', 'Monthly Quota', 'Usage %', 'Status', 'Requests Exceeding Quota', 'Remaining Quota', 'Normal Requests', 'Exceeding Requests'];
        const csvContent = [
            headers.join(','),
            ...this.filteredQuotaData.map(row => [
                row.user,
                row.totalRequests,
                row.monthlyQuota,
                row.usagePercentage.toFixed(1) + '%',
                row.status,
                row.exceedsQuotaRequests,
                row.remainingQuota,
                row.quotaBreakdown.normal,
                row.quotaBreakdown.exceeding
            ].join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quota-analysis-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    populateQuotaNearLimitModal() {
        const tbody = document.getElementById('quotaNearLimitDetailTableBody');
        tbody.innerHTML = '';

        const nearLimitUsers = this.filteredQuotaData
            .filter(row => row.usagePercentage >= 80 && row.usagePercentage <= 100)
            .sort((a, b) => b.usagePercentage - a.usagePercentage);

        nearLimitUsers.forEach(row => {
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td>${row.user}</td>
                <td>${row.totalRequests.toLocaleString()}</td>
                <td>${row.monthlyQuota.toLocaleString()}</td>
                <td class="quota-warning">${row.usagePercentage.toFixed(1)}%</td>
                <td class="quota-warning">${row.status}</td>
                <td>${row.remainingQuota.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    populateQuotaOverLimitModal() {
        const tbody = document.getElementById('quotaOverLimitDetailTableBody');
        tbody.innerHTML = '';

        const overLimitUsers = this.filteredQuotaData
            .filter(row => row.usagePercentage > 100)
            .sort((a, b) => b.usagePercentage - a.usagePercentage);

        overLimitUsers.forEach(row => {
            const tr = document.createElement('tr');
            const requestsOverQuota = Math.max(0, row.totalRequests - row.monthlyQuota);
            
            tr.innerHTML = `
                <td>${row.user}</td>
                <td>${row.totalRequests.toLocaleString()}</td>
                <td>${row.monthlyQuota.toLocaleString()}</td>
                <td class="quota-exceeded">${row.usagePercentage.toFixed(1)}%</td>
                <td class="quota-exceeded">${requestsOverQuota.toLocaleString()}</td>
                <td class="quota-exceeded">${row.status}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// Initialize the analyzer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CopilotUsageAnalyzer();
});
