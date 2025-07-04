class CopilotUsageAnalyzer {
    constructor() {
        this.rawData = [];
        this.filteredData = [];
        this.quotaData = [];
        this.filteredQuotaData = [];
        this.charts = {};
        this.currentTab = 'usage-dashboard';
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
        
        for (let i = 1; i < lines.length; i++) {
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
        
        if (this.rawData.length === 0) {
            alert('No valid data found in the CSV file. Please check the format.');
            return;
        }
        
        this.processData();
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
        
        // Apply initial filters
        this.applyFilters();
        this.applyQuotaFilters();
        
        // Show dashboard
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
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
                onClick: (event, elements) => {
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
        const hourlyByDay = dayNames.map((day, dayIndex) => {
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
                    data: performanceData.map((item, index) => ({
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
        
        sortedData.forEach(row => {
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
            case 'cost-analysis-modal':
                this.populateCostAnalysisModal();
                break;
            case 'cost-breakdown-modal':
                this.populateCostBreakdownModal();
                break;
        }
    }

    populateCostAnalysisModal() {
        const tbody = document.getElementById('costAnalysisTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        const userCosts = {};
        const costRates = {
            'gpt-4o': 0.005,
            'gpt-4.1': 0.003,
            'gpt-4': 0.003,
            'claude-sonnet-4': 0.003,
            'claude-3.7-sonnet': 0.003,
            'o1-2024-12-17': 0.015,
            'Code Review': 0.002
        };
        
        this.filteredData.forEach(row => {
            const baseModel = Object.keys(costRates).find(model => 
                row.model.toLowerCase().includes(model.toLowerCase())
            );
            const costPerRequest = baseModel ? costRates[baseModel] : 0.002;
            
            if (!userCosts[row.user]) {
                userCosts[row.user] = {
                    requests: 0,
                    cost: 0
                };
            }
            
            userCosts[row.user].requests += row.requests;
            userCosts[row.user].cost += row.requests * costPerRequest;
        });

        const sortedUsers = Object.entries(userCosts)
            .sort(([,a], [,b]) => b.cost - a.cost);

        sortedUsers.forEach(([user, data]) => {
            const avgCostPerRequest = data.requests > 0 ? (data.cost / data.requests) : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user}</td>
                <td>${data.requests.toLocaleString()}</td>
                <td>$${data.cost.toFixed(3)}</td>
                <td>$${avgCostPerRequest.toFixed(4)}</td>
            `;
            tbody.appendChild(tr);
        });
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

    showCostBreakdownDetails() {
        const modal = document.getElementById('cost-breakdown-modal');
        if (modal) {
            modal.style.display = 'block';
            this.populateCostBreakdownModal();
        }
    }

    populateCostBreakdownModal() {
        const tbody = document.getElementById('costBreakdownTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        const modelCosts = {};
        const costRates = {
            'gpt-4o': 0.005,
            'gpt-4.1': 0.003,
            'gpt-4': 0.003,
            'claude-sonnet-4': 0.003,
            'claude-3.7-sonnet': 0.003,
            'o1-2024-12-17': 0.015,
            'Code Review': 0.002
        };
        
        this.filteredData.forEach(row => {
            const baseModel = Object.keys(costRates).find(model => 
                row.model.toLowerCase().includes(model.toLowerCase())
            );
            const costPerRequest = baseModel ? costRates[baseModel] : 0.002;
            
            if (!modelCosts[row.model]) {
                modelCosts[row.model] = {
                    requests: 0,
                    cost: 0,
                    costPerRequest: costPerRequest
                };
            }
            
            modelCosts[row.model].requests += row.requests;
            modelCosts[row.model].cost += row.requests * costPerRequest;
        });

        const totalCost = Object.values(modelCosts).reduce((sum, model) => sum + model.cost, 0);
        const sortedModels = Object.entries(modelCosts)
            .sort(([,a], [,b]) => b.cost - a.cost);

        sortedModels.forEach(([model, data]) => {
            const percentage = totalCost > 0 ? ((data.cost / totalCost) * 100).toFixed(1) : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${model}</td>
                <td>${data.requests.toLocaleString()}</td>
                <td>$${data.costPerRequest.toFixed(4)}</td>
                <td>$${data.cost.toFixed(3)}</td>
                <td>${percentage}%</td>
            `;
            tbody.appendChild(tr);
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
                onClick: (event, elements) => {
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
        
        sortedData.forEach(row => {
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
