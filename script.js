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
        
        document.getElementById('totalUsers').textContent = totalUsers.toLocaleString();
        document.getElementById('totalRequests').textContent = totalRequests.toLocaleString();
        document.getElementById('totalModels').textContent = totalModels.toLocaleString();
        document.getElementById('avgRequestsPerUser').textContent = avgRequestsPerUser.toLocaleString();
        document.getElementById('dailyAverage').textContent = dailyAverage.toLocaleString();
    }

    updateCharts() {
        this.createTimelineChart();
        this.createModelChart();
        this.createModelBarChart();
        this.createUserChart();
        this.createModelTrendsChart();
        this.createDayOfWeekChart();
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
        const dayData = {
            0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
        };
        
        this.filteredData.forEach(row => {
            const dayOfWeek = row.timestamp.getDay();
            dayData[dayOfWeek] += row.requests;
        });
        
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const values = Object.values(dayData);
        
        this.charts.dayOfWeek = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dayNames,
                datasets: [{
                    label: 'Requests',
                    data: values,
                    backgroundColor: '#4facfe',
                    borderColor: '#4facfe',
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

    generateColors(count) {
        const colors = [
            'rgba(102, 126, 234, 0.8)',
            'rgba(240, 147, 251, 0.8)',
            'rgba(79, 172, 254, 0.8)',
            'rgba(255, 107, 107, 0.8)',
            'rgba(54, 215, 183, 0.8)',
            'rgba(255, 195, 113, 0.8)',
            'rgba(196, 181, 253, 0.8)',
            'rgba(255, 154, 158, 0.8)',
            'rgba(134, 239, 172, 0.8)',
            'rgba(251, 191, 36, 0.8)'
        ];
        
        if (count <= colors.length) {
            return colors.slice(0, count);
        }
        
        // Generate additional colors if needed
        const additionalColors = [];
        for (let i = colors.length; i < count; i++) {
            const hue = (i * 137.508) % 360; // Golden angle approximation
            additionalColors.push(`hsla(${hue}, 70%, 60%, 0.8)`);
        }
        
        return [...colors, ...additionalColors];
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
        this.updateQuotaDashboard();
    }

    updateQuotaDashboard() {
        if (this.currentTab !== 'quota-dashboard') return;
        
        this.updateQuotaStatCards();
        this.updateQuotaCharts();
        this.updateQuotaTable();
    }

    updateQuotaStatCards() {
        const data = this.filteredQuotaData;
        
        const totalUsers = data.length;
        const usersOverQuota = data.filter(row => row.usagePercentage > 100).length;
        const averageUsage = totalUsers > 0 
            ? (data.reduce((sum, row) => sum + row.usagePercentage, 0) / totalUsers).toFixed(1)
            : 0;
        
        document.getElementById('quotaTotalUsers').textContent = totalUsers.toLocaleString();
        document.getElementById('quotaExceededUsers').textContent = usersOverQuota.toLocaleString();
        document.getElementById('quotaAverageUsage').textContent = averageUsage + '%';
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
}

// Initialize the analyzer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CopilotUsageAnalyzer();
});
