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
        
        this.init();
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
        
        // Check for cached data on load
        this.checkForCachedData();
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
        try {
            const response = await fetch('./data_example.csv');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const csvText = await response.text();
            this.parseCSV(csvText);
        } catch (error) {
            console.error('Error loading sample data:', error);
            // Try without the ./ prefix
            try {
                const response = await fetch('data_example.csv');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const csvText = await response.text();
                this.parseCSV(csvText);
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                alert('Error loading sample data. Please upload your own CSV file.');
            }
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.parseCSV(e.target.result);
        };
        reader.readAsText(file);
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = this.parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
        
        this.rawData = [];
        this.processingComplete = false;
        
        // Show loading indicator
        this.showLoadingIndicator('Parsing CSV data...');
        
        // Use chunked processing for large files
        this.processCSVChunks(lines, headers, 1);
    }
    
    processCSVChunks(lines, headers, startIndex) {
        // Process a chunk of the CSV data
        const endIndex = Math.min(startIndex + this.chunkSize, lines.length);
        
        // Update loading progress
        const progress = Math.floor((startIndex / lines.length) * 100);
        this.updateLoadingProgress(progress);
        
        // Process this chunk
        for (let i = startIndex; i < endIndex; i++) {
            const values = this.parseCSVLine(lines[i]).map(v => v.trim().replace(/^"|"$/g, ''));
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index];
                });
                
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
                }
            }
        }
        
        // If there are more chunks to process, schedule the next chunk
        if (endIndex < lines.length) {
            setTimeout(() => {
                this.processCSVChunks(lines, headers, endIndex);
            }, 0); // Use setTimeout to avoid blocking the UI
        } else {
            // All chunks processed
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
        
        // Sort data by timestamp
        this.rawData.sort((a, b) => a.timestamp - b.timestamp);
        
        // Initialize filters
        this.populateFilters();
        
        // Process quota data
        this.processQuotaData();
        
        // Add data aggregation options
        this.addAggregationOptions();
        
        // Apply initial filters
        this.applyFilters();
        this.applyQuotaFilters();
        
        // Show dashboard
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
    }
    
    addAggregationOptions() {
        // Create aggregation options container if it doesn't exist
        let aggregationContainer = document.querySelector('.aggregation-options');
        if (!aggregationContainer) {
            aggregationContainer = document.createElement('div');
            aggregationContainer.className = 'aggregation-options';
            
            // Add it after the filters
            const filtersContainer = document.querySelector('.filters');
            if (filtersContainer) {
                filtersContainer.insertAdjacentElement('afterend', aggregationContainer);
            }
        }
        
        // Set content
        aggregationContainer.innerHTML = `
            <div class="aggregation-header">
                <h3>Data Aggregation</h3>
                <p>Optimize performance by aggregating data</p>
            </div>
            <div class="aggregation-controls">
                <div class="aggregation-group">
                    <label for="timeAggregation">Time Grouping:</label>
                    <select id="timeAggregation">
                        <option value="none">No Grouping</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                    </select>
                </div>
                <div class="aggregation-group">
                    <label for="dataLimit">Data Points Limit:</label>
                    <select id="dataLimit">
                        <option value="0">No Limit</option>
                        <option value="100">100 Points</option>
                        <option value="500">500 Points</option>
                        <option value="1000">1000 Points</option>
                    </select>
                </div>
                <button id="applyAggregation" class="aggregation-btn">
                    Apply Aggregation
                </button>
            </div>
        `;
        
        // Add styles
        if (!document.getElementById('aggregation-styles')) {
            const style = document.createElement('style');
            style.id = 'aggregation-styles';
            style.textContent = `
                .aggregation-options {
                    background: white;
                    padding: 20px;
                    border-radius: 15px;
                    margin-bottom: 30px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                
                .aggregation-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                
                .aggregation-header h3 {
                    margin: 0;
                    color: #333;
                    font-size: 1.2rem;
                }
                
                .aggregation-header p {
                    margin: 0;
                    color: #666;
                    font-size: 0.9rem;
                }
                
                .aggregation-controls {
                    display: flex;
                    gap: 20px;
                    flex-wrap: wrap;
                    align-items: flex-end;
                }
                
                .aggregation-group {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }
                
                .aggregation-group label {
                    font-weight: 500;
                    color: #333;
                }
                
                .aggregation-group select {
                    padding: 8px 12px;
                    border: 2px solid #e1e1e1;
                    border-radius: 8px;
                    background: white;
                    cursor: pointer;
                    min-width: 150px;
                }
                
                .aggregation-btn {
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    height: 37px;
                }
                
                .aggregation-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
                }
                
                @media (max-width: 768px) {
                    .aggregation-controls {
                        flex-direction: column;
                        align-items: stretch;
                    }
                    
                    .aggregation-btn {
                        margin-top: 10px;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Add event listeners
        document.getElementById('applyAggregation').addEventListener('click', () => this.applyDataAggregation());
    }
    
    applyDataAggregation() {
        const timeAggregation = document.getElementById('timeAggregation').value;
        const dataLimit = parseInt(document.getElementById('dataLimit').value);
        
        // Show loading indicator
        this.showLoadingIndicator('Applying data aggregation...');
        
        // Use setTimeout to avoid blocking UI
        setTimeout(() => {
            // Apply aggregation based on selected options
            if (timeAggregation !== 'none') {
                this.aggregateDataByTime(timeAggregation);
            }
            
            // Apply data point limiting if needed
            if (dataLimit > 0) {
                this.limitDataPoints(dataLimit);
            }
            
            // Hide loading indicator
            this.hideLoadingIndicator();
            
            // Update dashboard with aggregated data
            this.applyFilters();
            this.applyQuotaFilters();
            
            // Show notification
            this.showNotification('Data aggregation applied successfully');
        }, 100);
    }
    
    aggregateDataByTime(timeAggregation) {
        // Create a copy of the original data
        const originalData = [...this.rawData];
        
        // Group data by the selected time period
        const groupedData = {};
        
        originalData.forEach(row => {
            let timeKey;
            const date = row.timestamp;
            
            if (timeAggregation === 'daily') {
                // Group by day: YYYY-MM-DD
                timeKey = date.toISOString().split('T')[0];
            } else if (timeAggregation === 'weekly') {
                // Group by week: YYYY-WW (year and week number)
                const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
                const weekNumber = Math.ceil(((date - firstDayOfYear) / 86400000 + firstDayOfYear.getDay() + 1) / 7);
                timeKey = `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
            } else if (timeAggregation === 'monthly') {
                // Group by month: YYYY-MM
                timeKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            }
            
            // Create group key combining time, user and model
            const groupKey = `${timeKey}|${row.user}|${row.model}`;
            
            if (!groupedData[groupKey]) {
                groupedData[groupKey] = {
                    timestamp: new Date(timeKey.includes('W') 
                        ? this.getDateOfWeek(parseInt(timeKey.split('-W')[1]), parseInt(timeKey.split('-')[0]))
                        : timeKey),
                    user: row.user,
                    model: row.model,
                    requests: 0,
                    exceedsQuota: false,
                    quota: row.quota,
                    originalData: row.originalData
                };
            }
            
            // Sum requests
            groupedData[groupKey].requests += row.requests;
            
            // If any row exceeds quota, mark the group as exceeding
            if (row.exceedsQuota) {
                groupedData[groupKey].exceedsQuota = true;
            }
        });
        
        // Convert back to array
        this.rawData = Object.values(groupedData);
        
        // Recalculate quota data
        this.processQuotaData();
    }
    
    getDateOfWeek(weekNumber, year) {
        // Get the first day of the year
        const firstDayOfYear = new Date(year, 0, 1);
        
        // Get the first Monday of the year
        const firstMonday = new Date(year, 0, 1 + (8 - firstDayOfYear.getDay()) % 7);
        
        // Add the weeks
        const targetDate = new Date(firstMonday);
        targetDate.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);
        
        return targetDate;
    }
    
    limitDataPoints(limit) {
        if (this.rawData.length <= limit) {
            return; // No need to limit
        }
        
        // Sort by timestamp (newest first)
        this.rawData.sort((a, b) => b.timestamp - a.timestamp);
        
        // Get the most recent data points up to the limit
        this.rawData = this.rawData.slice(0, limit);
        
        // Recalculate quota data
        this.processQuotaData();
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
        const dateRange = document.getElementById('dateRange').value;
        const userFilter = document.getElementById('userFilter').value;
        const modelFilter = document.getElementById('modelFilter').value;
        
        let filtered = [...this.rawData];
        
        // Date filter
        if (dateRange !== 'all') {
            const days = parseInt(dateRange);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            filtered = filtered.filter(row => row.timestamp >= cutoffDate);
        }
        
        // User filter
        if (userFilter !== 'all') {
            filtered = filtered.filter(row => row.user === userFilter);
        }
        
        // Model filter
        if (modelFilter !== 'all') {
            filtered = filtered.filter(row => row.model === modelFilter);
        }
        
        this.filteredData = filtered;
        this.updateDashboard();
    }

    updateDashboard() {
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
        setTimeout(() => {
            if (tabId === 'quota-dashboard') {
                this.updateQuotaDashboard();
            } else {
                this.updateDashboard();
            }
        }, 100);
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
