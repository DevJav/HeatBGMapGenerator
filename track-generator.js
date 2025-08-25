class HeatTrackGenerator {
    constructor() {
        this.trackData = null;
        this.currentMode = 'pan';
        this.isDragging = false;
        this.draggedElement = null;
        this.draggedSegmentId = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        
        // SVG ViewBox dimensions
        this.viewBoxWidth = 1000;
        this.viewBoxHeight = 800;
        
        // Default visual settings
        this.defaultSettings = {
            segmentNumberSize: 12,
            speedLimitSize: 64,
            normalSegmentWidth: 8,
            curveSegmentWidth: 25,
            borderWidth: 5,
            centerlineWidth: 10,
            dashLength: 25,
            gapLength: 25,
            trackOutlineWidth: 6,
            trackOutlineDashLength: 15,
            trackOutlineGapLength: 10
        };
        
        // Load saved settings or use defaults
        this.visualSettings = this.loadVisualSettings();
        
        this.initializeEventListeners();
        this.setupSVGInteraction();
    }

    initializeEventListeners() {
        // File upload
        const fileUpload = document.getElementById('fileUpload');
        const fileInput = document.getElementById('fileInput');
        
        fileUpload.addEventListener('click', () => fileInput.click());
        fileUpload.addEventListener('dragover', this.handleDragOver.bind(this));
        fileUpload.addEventListener('drop', this.handleDrop.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Generate button
        document.getElementById('generateBtn').addEventListener('click', this.generateTrack.bind(this));

        // Mode buttons
        document.getElementById('panMode').addEventListener('click', () => this.setMode('pan'));
        document.getElementById('editMode').addEventListener('click', () => this.setMode('edit'));
        document.getElementById('curveMode').addEventListener('click', () => this.setMode('curve'));
        document.getElementById('outlineMode').addEventListener('click', () => this.setMode('outline'));

        // Export buttons
        document.getElementById('exportPNG').addEventListener('click', () => this.exportTrack('png'));
        document.getElementById('exportSVG').addEventListener('click', () => this.exportTrack('svg'));

        // Settings change listeners
        document.getElementById('trackWidth').addEventListener('change', this.onSettingChange.bind(this));
        document.getElementById('segmentLength').addEventListener('change', this.onSettingChange.bind(this));
        
        // Visual settings listeners
        document.getElementById('segmentNumberSize').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('speedLimitSize').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('normalSegmentWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('curveSegmentWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('borderWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('centerlineWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('dashLength').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('gapLength').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('trackOutlineWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('trackOutlineDashLength').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('trackOutlineGapLength').addEventListener('change', this.onVisualSettingChange.bind(this));
        
        // Settings buttons
        document.getElementById('saveSettings').addEventListener('click', this.saveVisualSettings.bind(this));
        document.getElementById('loadSettings').addEventListener('click', this.loadAndApplySettings.bind(this));
        document.getElementById('resetSettings').addEventListener('click', this.resetToDefaultSettings.bind(this));
        
        // Debug button
        document.getElementById('clearDebugBtn').addEventListener('click', this.clearDebugPoints.bind(this));
    }

    setupSVGInteraction() {
        const svg = document.getElementById('trackCanvas');
        
        svg.addEventListener('mousedown', this.handleMouseDown.bind(this));
        svg.addEventListener('mousemove', this.handleMouseMove.bind(this));
        svg.addEventListener('mouseup', this.handleMouseUp.bind(this));
        svg.addEventListener('wheel', this.handleWheel.bind(this));
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.loadSVGFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.loadSVGFile(file);
        }
    }

    async loadSVGFile(file) {
        if (!file.name.toLowerCase().endsWith('.svg')) {
            this.showStatus('Please select an SVG file', 'error');
            return;
        }

        try {
            const svgContent = await this.readFileAsText(file);
            this.parseSVGCenterline(svgContent);
            
            document.getElementById('fileName').textContent = `📄 ${file.name}`;
            document.getElementById('generateBtn').disabled = false;
            this.showStatus(`File loaded: ${file.name}`, 'success');
        } catch (error) {
            this.showStatus('Error loading SVG: ' + error.message, 'error');
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    parseSVGCenterline(svgContent) {
        // Parse SVG and extract the first path as centerline
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
        const paths = svgDoc.querySelectorAll('path');
        
        if (paths.length === 0) {
            throw new Error('No paths found in SVG file');
        }

        // Use the first path as the centerline
        const path = paths[0];
        const pathLength = path.getTotalLength();
        
        // Sample points along the path
        const points = [];
        const numSamples = 1000; // TODO: Configurable parameter
        
        for (let i = 0; i <= numSamples; i++) {
            const distance = (i / numSamples) * pathLength;
            const point = path.getPointAtLength(distance);
            points.push([point.x, point.y]);
        }
        
        this.centerlinePoints = points;
        console.log(`Extracted ${points.length} centerline points`);
        
        // Show preview of the loaded centerline
        this.showCenterlinePreview();
    }

    showCenterlinePreview() {
        if (!this.centerlinePoints || this.centerlinePoints.length === 0) return;

        const svg = document.getElementById('trackCanvas');
        
        // Clear existing content
        const existingTrack = svg.querySelector('#trackGroup');
        if (existingTrack) existingTrack.remove();
        
        const placeholderText = svg.querySelector('text');
        if (placeholderText) placeholderText.remove();

        // Create preview group
        const previewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        previewGroup.id = 'trackGroup';
        
        // Auto-scale and center the preview
        this.autoScaleAndCenterPreview(previewGroup);

        // Create centerline path for preview
        const centerPath = this.createPathFromPoints(this.centerlinePoints);
        centerPath.setAttribute('stroke', '#fb0000ff'); // Green color for preview
        centerPath.setAttribute('stroke-width', '25');
        centerPath.setAttribute('fill', 'none');
        previewGroup.appendChild(centerPath);
        
        svg.appendChild(previewGroup);
    }

    autoScaleAndCenterPreview(previewGroup) {
        const bounds = this.calculateCenterlineBounds();
        
        const scaleX = this.viewBoxWidth / (bounds.maxX - bounds.minX + 100);
        const scaleY = this.viewBoxHeight / (bounds.maxY - bounds.minY + 100);
        this.scale = Math.min(scaleX, scaleY, 2);
        
        this.panX = (this.viewBoxWidth - (bounds.maxX - bounds.minX) * this.scale) / 2 - bounds.minX * this.scale;
        this.panY = (this.viewBoxHeight - (bounds.maxY - bounds.minY) * this.scale) / 2 - bounds.minY * this.scale;
        
        previewGroup.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
    }

    calculateCenterlineBounds() {
        if (!this.centerlinePoints || this.centerlinePoints.length === 0) {
            return { minX: 0, maxX: 100, minY: 0, maxY: 100, centerX: 50, centerY: 50 };
        }

        const minX = Math.min(...this.centerlinePoints.map(p => p[0]));
        const maxX = Math.max(...this.centerlinePoints.map(p => p[0]));
        const minY = Math.min(...this.centerlinePoints.map(p => p[1]));
        const maxY = Math.max(...this.centerlinePoints.map(p => p[1]));

        return {
            minX, maxX, minY, maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    generateTrack() {
        if (!this.centerlinePoints) {
            this.showStatus('Please load an SVG file first', 'error');
            return;
        }

        const trackWidth = parseFloat(document.getElementById('trackWidth').value);
        const segmentLength = parseFloat(document.getElementById('segmentLength').value);

        this.showLoading(true);

        try {
            // Generate track borders
            this.generateTrackBorders(trackWidth);
            
            // Divide track into segments
            this.divideTrackIntoSegments(segmentLength, trackWidth);
            
            // Create track data object
            this.trackData = {
                centerline: this.centerlinePoints,
                left_border: this.leftBorderPoints,
                right_border: this.rightBorderPoints,
                segments: this.segmentDivisions,
                track_width: trackWidth,
                segment_length: segmentLength
            };
            
            // Render the track
            this.renderTrack();
            
            this.showStatus('Track generated successfully!', 'success');
        } catch (error) {
            this.showStatus('Generation failed: ' + error.message, 'error');
        }

        this.showLoading(false);
    }

    generateTrackBorders(trackWidth) {
        // Generate parallel offset lines for track borders
        const offsetDistance = trackWidth / 2;
        
        this.leftBorderPoints = this.createParallelLine(this.centerlinePoints, offsetDistance, 'left');
        this.rightBorderPoints = this.createParallelLine(this.centerlinePoints, offsetDistance, 'right');
        
        console.log(`Generated track borders: ${this.leftBorderPoints.length} left, ${this.rightBorderPoints.length} right`);
    }

    createParallelLine(points, distance, side) {
        const offsetPoints = [];
        
        for (let i = 0; i < points.length; i++) {
            let tangent;
            
            if (i === 0) {
                // First point: use direction to next point
                tangent = this.normalize([
                    points[i + 1][0] - points[i][0],
                    points[i + 1][1] - points[i][1]
                ]);
            } else if (i === points.length - 1) {
                // Last point: use direction from previous point
                tangent = this.normalize([
                    points[i][0] - points[i - 1][0],
                    points[i][1] - points[i - 1][1]
                ]);
            } else {
                // Middle points: average of incoming and outgoing directions
                const incoming = this.normalize([
                    points[i][0] - points[i - 1][0],
                    points[i][1] - points[i - 1][1]
                ]);
                const outgoing = this.normalize([
                    points[i + 1][0] - points[i][0],
                    points[i + 1][1] - points[i][1]
                ]);
                tangent = this.normalize([
                    (incoming[0] + outgoing[0]) / 2,
                    (incoming[1] + outgoing[1]) / 2
                ]);
            }
            
            // Calculate perpendicular vector
            const perpendicular = side === 'left' ? 
                [-tangent[1], tangent[0]] : 
                [tangent[1], -tangent[0]];
            
            // Offset the point
            const offsetPoint = [
                points[i][0] + perpendicular[0] * distance,
                points[i][1] + perpendicular[1] * distance
            ];
            
            offsetPoints.push(offsetPoint);
        }
        
        return offsetPoints;
    }

    normalize(vector) {
        const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
        return length > 0 ? [vector[0] / length, vector[1] / length] : [0, 0];
    }

    divideTrackIntoSegments(segmentLength, trackWidth = null) {
        // Constants
        const MIN_SEGMENT_DISTANCE_RATIO = 0.5; // Minimum distance as ratio of segment length
        const EPSILON = 1e-10; // Small value to prevent division by zero
        
        // Input validation
        if (!this.centerlinePoints || this.centerlinePoints.length < 2) {
            throw new Error('Invalid centerline points: Need at least 2 points');
        }
        
        if (segmentLength <= 0) {
            throw new Error('Segment length must be positive');
        }
        
        // Get track width from parameter or DOM fallback
        const halfWidth = trackWidth ? 
            trackWidth / 2 : 
            parseFloat(document.getElementById('trackWidth').value) / 2;
        
        if (halfWidth <= 0) {
            throw new Error('Track width must be positive');
        }
        
        // Calculate cumulative distances along centerline
        const distances = [0];
        for (let i = 1; i < this.centerlinePoints.length; i++) {
            const prev = this.centerlinePoints[i - 1];
            const curr = this.centerlinePoints[i];
            const dist = Math.sqrt(
                Math.pow(curr[0] - prev[0], 2) + Math.pow(curr[1] - prev[1], 2)
            );
            distances.push(distances[distances.length - 1] + dist);
        }
        
        const totalLength = distances[distances.length - 1];
        
        // Check if track is long enough for segments
        if (totalLength < segmentLength) {
            console.warn(`Track length (${totalLength.toFixed(2)}) is shorter than segment length (${segmentLength})`);
            this.segmentDivisions = [];
            return;
        }
        
        const numSegments = Math.floor(totalLength / segmentLength);
        
        console.log(`Track length: ${totalLength.toFixed(2)} units`);
        console.log(`Creating ${numSegments} segments of ${segmentLength} units each`);
        
        // Find points at segment boundaries using optimized search
        const segmentDivisions = [];
        let distanceIndex = 0; // Performance optimization: maintain search pointer
        
        for (let i = 0; i <= numSegments; i++) {
            const targetDistance = i * segmentLength;
            
            // Advance pointer to correct position (optimization)
            while (distanceIndex < distances.length - 1 && 
                   distances[distanceIndex + 1] < targetDistance) {
                distanceIndex++;
            }
            
            // Ensure we're within bounds
            if (distanceIndex >= distances.length - 1) {
                console.warn(`Reached end of centerline at segment ${i}`);
                break;
            }
            
            // Safety check for division by zero
            const segmentDistance = distances[distanceIndex + 1] - distances[distanceIndex];
            if (segmentDistance < EPSILON) {
                console.warn(`Zero distance between points ${distanceIndex} and ${distanceIndex + 1}, skipping`);
                continue;
            }
            
            // Interpolate between points
            const t = (targetDistance - distances[distanceIndex]) / segmentDistance;
            
            // Clamp t to [0, 1] range for safety
            const clampedT = Math.max(0, Math.min(1, t));
            
            const p1 = this.centerlinePoints[distanceIndex];
            const p2 = this.centerlinePoints[distanceIndex + 1];
            
            // Interpolated point on centerline
            const centerPoint = [
                p1[0] + clampedT * (p2[0] - p1[0]),
                p1[1] + clampedT * (p2[1] - p1[1])
            ];
            
            // Calculate direction for perpendicular
            const direction = this.normalize([p2[0] - p1[0], p2[1] - p1[1]]);
            
            // Handle case where direction is zero (duplicate points)
            if (direction[0] === 0 && direction[1] === 0) {
                console.warn(`Zero direction vector at segment ${i}, using default direction`);
                direction[0] = 1; // Default to horizontal direction
            }
            
            const perpendicular = [-direction[1], direction[0]];
            
            // Create perpendicular line across track width
            const lineStart = [
                centerPoint[0] - perpendicular[0] * halfWidth,
                centerPoint[1] - perpendicular[1] * halfWidth
            ];
            const lineEnd = [
                centerPoint[0] + perpendicular[0] * halfWidth,
                centerPoint[1] + perpendicular[1] * halfWidth
            ];
            
            segmentDivisions.push({
                segment_number: i + 1,
                center_point: centerPoint,
                line_start: lineStart,
                line_end: lineEnd,
                distance: targetDistance,
                is_curve: false,
                speed_limit: 0,
                has_track_outline: false
            });
        }
        
        // Check for closed track and remove last segment if too close to first
        if (segmentDivisions.length > 1) {
            const first = segmentDivisions[0];
            const last = segmentDivisions[segmentDivisions.length - 1];
            const distanceToFirst = Math.sqrt(
                Math.pow(last.center_point[0] - first.center_point[0], 2) +
                Math.pow(last.center_point[1] - first.center_point[1], 2)
            );
            
            const minDistance = segmentLength * MIN_SEGMENT_DISTANCE_RATIO;
            if (distanceToFirst < minDistance) {
                segmentDivisions.pop();
                console.log(`Removed last segment due to insufficient distance (${distanceToFirst.toFixed(2)}) to first segment`);
            }
        }
        
        // Re-number segments to ensure continuous numbering
        segmentDivisions.forEach((segment, index) => {
            segment.segment_number = index + 1;
        });
        
        this.segmentDivisions = segmentDivisions;
        console.log(`Created ${segmentDivisions.length} segment divisions`);
        
        // Validate result
        if (segmentDivisions.length === 0) {
            console.warn('No segments were created - check input parameters');
        }
    }

    renderTrack(preserveView = false) {
        if (!this.trackData) return;

        const svg = document.getElementById('trackCanvas');
        
        // Store current transform if preserving view
        let currentTransform = null;
        if (preserveView) {
            const existingTrack = svg.querySelector('#trackGroup');
            if (existingTrack) {
                currentTransform = existingTrack.getAttribute('transform');
            }
        }
        
        // Clear existing track
        const existingTrack = svg.querySelector('#trackGroup');
        if (existingTrack) existingTrack.remove();
        
        const placeholderText = svg.querySelector('text');
        if (placeholderText) placeholderText.remove();

        // Create main group
        const trackGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        trackGroup.id = 'trackGroup';
        
        // Apply transform based on preserveView flag
        if (preserveView && currentTransform) {
            // Preserve the existing view
            trackGroup.setAttribute('transform', currentTransform);
        } else {
            // Auto-scale and center for initial render
            this.autoScaleAndCenter(trackGroup);
        }

        // Render track components
        this.renderTrackFill(trackGroup);
        this.renderTrackBorders(trackGroup);
        this.renderTrackOutlines(trackGroup);
        this.renderCenterline(trackGroup);
        this.renderSegmentDivisions(trackGroup);

        svg.appendChild(trackGroup);
    }

    autoScaleAndCenter(trackGroup) {
        const bounds = this.calculateBounds();
        
        const scaleX = this.viewBoxWidth / (bounds.maxX - bounds.minX + 100);
        const scaleY = this.viewBoxHeight / (bounds.maxY - bounds.minY + 100);
        this.scale = Math.min(scaleX, scaleY, 2);
        
        this.panX = (this.viewBoxWidth - (bounds.maxX - bounds.minX) * this.scale) / 2 - bounds.minX * this.scale;
        this.panY = (this.viewBoxHeight - (bounds.maxY - bounds.minY) * this.scale) / 2 - bounds.minY * this.scale;
        
        trackGroup.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
    }

    calculateBounds() {
        const allPoints = [
            ...this.trackData.centerline,
            ...this.trackData.left_border,
            ...this.trackData.right_border
        ];

        return {
            minX: Math.min(...allPoints.map(p => p[0])),
            maxX: Math.max(...allPoints.map(p => p[0])),
            minY: Math.min(...allPoints.map(p => p[1])),
            maxY: Math.max(...allPoints.map(p => p[1]))
        };
    }

    renderTrackFill(group) {
        const trackPoints = [
            ...this.trackData.left_border,
            ...this.trackData.right_border.slice().reverse()
        ];

        const pathData = trackPoints.map((point, index) => 
            `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`
        ).join(' ') + ' Z';

        const trackPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        trackPath.setAttribute('d', pathData);
        trackPath.setAttribute('fill', 'black');
        trackPath.setAttribute('stroke', 'none');
        
        group.appendChild(trackPath);
    }

    renderTrackBorders(group) {
        // Left border
        const leftPath = this.createPathFromPoints(this.trackData.left_border);
        leftPath.setAttribute('stroke', 'white');
        leftPath.setAttribute('stroke-width', this.visualSettings.borderWidth);
        leftPath.setAttribute('fill', 'none');
        group.appendChild(leftPath);

        // Right border
        const rightPath = this.createPathFromPoints(this.trackData.right_border);
        rightPath.setAttribute('stroke', 'white');
        rightPath.setAttribute('stroke-width', this.visualSettings.borderWidth);
        rightPath.setAttribute('fill', 'none');
        group.appendChild(rightPath);
    }

    renderTrackOutlines(group) {
        // Render red and white dashed outlines for segments marked with outline
        const outlinedSegments = this.trackData.segments.filter(s => s.has_track_outline);
        
        outlinedSegments.forEach(segment => {
            this.createTrackOutlineForSegment(segment, group);
        });
    }

    renderCenterline(group) {
        const centerPath = this.createPathFromPoints(this.trackData.centerline);
        centerPath.setAttribute('stroke', 'white');
        centerPath.setAttribute('stroke-width', this.visualSettings.centerlineWidth);
        centerPath.setAttribute('stroke-dasharray', `${this.visualSettings.dashLength} ${this.visualSettings.gapLength}`);
        centerPath.setAttribute('fill', 'none');
        centerPath.setAttribute('opacity', '1');
        group.appendChild(centerPath);
    }

    renderSegmentDivisions(group) {
        this.trackData.segments.forEach(segment => {
            // Create visible segment line
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', segment.line_start[0]);
            line.setAttribute('y1', segment.line_start[1]);
            line.setAttribute('x2', segment.line_end[0]);
            line.setAttribute('y2', segment.line_end[1]);
            line.setAttribute('stroke', 'white');
            line.setAttribute('stroke-width', this.getSegmentStrokeWidth(segment.is_curve));
            line.setAttribute('opacity', '1');
            line.setAttribute('class', 'segment-line-visual');
            line.setAttribute('data-segment-id', segment.segment_number);
            line.style.pointerEvents = 'none';
            group.appendChild(line);

            // Create invisible hit area for easier selection
            const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hitArea.setAttribute('x1', segment.line_start[0]);
            hitArea.setAttribute('y1', segment.line_start[1]);
            hitArea.setAttribute('x2', segment.line_end[0]);
            hitArea.setAttribute('y2', segment.line_end[1]);
            hitArea.setAttribute('stroke', 'transparent');
            hitArea.setAttribute('stroke-width', '25');
            hitArea.setAttribute('opacity', '0');
            hitArea.setAttribute('class', 'segment-line');
            hitArea.setAttribute('data-segment-id', segment.segment_number);
            hitArea.style.cursor = this.getCursorForMode();
            group.appendChild(hitArea);

            // Add segment number
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', segment.center_point[0]);
            text.setAttribute('y', segment.center_point[1]);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', 'white');
            text.setAttribute('font-size', this.visualSettings.segmentNumberSize);
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('class', `segment-number ${this.currentMode === 'edit' ? 'draggable' : ''}`);
            text.setAttribute('data-segment-id', segment.segment_number);
            text.setAttribute('stroke', 'black');
            text.setAttribute('stroke-width', '0.5');
            text.style.pointerEvents = this.currentMode === 'edit' ? 'auto' : 'none';
            text.style.cursor = this.currentMode === 'edit' ? 'move' : 'default';
            text.textContent = segment.segment_number;
            group.appendChild(text);
            
            // Add speed limit text for curves
            if (segment.is_curve && segment.speed_limit) {
                this.createSpeedLimitText(segment, group);
            }
        });
    }

    createPathFromPoints(points) {
        const pathData = points.map((point, index) => 
            `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`
        ).join(' ');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        return path;
    }

    createSpeedLimitText(segment, group) {
        const speedText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        speedText.setAttribute('id', `speed-text-${segment.segment_number}`);
        speedText.setAttribute('x', segment.center_point[0] + 20);
        speedText.setAttribute('y', segment.center_point[1]);
        speedText.setAttribute('text-anchor', 'middle');
        speedText.setAttribute('dominant-baseline', 'middle');
        speedText.setAttribute('fill', 'yellow');
        speedText.setAttribute('font-size', this.visualSettings.speedLimitSize);
        speedText.setAttribute('font-weight', 'bold');
        speedText.setAttribute('stroke', 'black');
        speedText.setAttribute('stroke-width', '0.5');
        speedText.setAttribute('class', 'speed-limit-text');
        speedText.style.pointerEvents = 'none';
        speedText.textContent = segment.speed_limit;
        group.appendChild(speedText);
        return speedText;
    }

    getSegmentStrokeWidth(isCurve) {
        return isCurve ? this.visualSettings.curveSegmentWidth : this.visualSettings.normalSegmentWidth;
    }

    getCursorForMode() {
        switch (this.currentMode) {
            case 'edit': return 'move';
            case 'curve':
            case 'outline': return 'pointer';
            default: return 'default';
        }
    }

    // Settings management methods
    loadVisualSettings() {
        const saved = localStorage.getItem('heatTrackVisualSettings');
        const settings = saved ? JSON.parse(saved) : { ...this.defaultSettings };
        this.applySettingsToUI(settings);
        return settings;
    }

    applySettingsToUI(settings) {
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) element.value = settings[key];
        });
    }

    saveVisualSettings() {
        localStorage.setItem('heatTrackVisualSettings', JSON.stringify(this.visualSettings));
        this.showStatus('Settings saved successfully!', 'success');
    }

    loadAndApplySettings() {
        this.visualSettings = this.loadVisualSettings();
        if (this.trackData) {
            this.renderTrack(true); // Preserve view when loading settings
        }
        this.showStatus('Settings loaded and applied!', 'success');
    }

    resetToDefaultSettings() {
        this.visualSettings = { ...this.defaultSettings };
        this.applySettingsToUI(this.visualSettings);
        if (this.trackData) {
            this.renderTrack(true); // Preserve view when resetting settings
        }
        this.showStatus('Settings reset to default!', 'success');
    }

    onVisualSettingChange(e) {
        const settingName = e.target.id;
        const value = parseInt(e.target.value);
        this.visualSettings[settingName] = value;
        
        if (this.trackData) {
            this.renderTrack(true); // Preserve view when changing visual settings
        }
    }

    onSettingChange() {
        if (this.trackData && this.centerlinePoints) {
            this.generateTrack();
        }
    }

    // Mode and interaction methods
    setMode(mode) {
        this.currentMode = mode;
        
        // Update button states
        document.querySelectorAll('.toolbar .btn').forEach(btn => {
            btn.style.opacity = '0.7';
        });
        document.getElementById(`${mode}Mode`).style.opacity = '1';
        
        // Show/hide controls
        document.getElementById('curveControls').style.display = mode === 'curve' ? 'block' : 'none';
        document.getElementById('outlineControls').style.display = mode === 'outline' ? 'block' : 'none';
        document.getElementById('editControls').style.display = mode === 'edit' ? 'block' : 'none';
        
        // Update cursors and pointer events
        const svg = document.getElementById('trackCanvas');
        svg.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
        
        const segmentLines = svg.querySelectorAll('.segment-line');
        segmentLines.forEach(line => {
            line.style.cursor = this.getCursorForMode();
        });
        
        // Update segment number pointer events for edit mode
        const segmentNumbers = svg.querySelectorAll('.segment-number');
        segmentNumbers.forEach(text => {
            text.style.pointerEvents = mode === 'edit' ? 'auto' : 'none';
            text.style.cursor = mode === 'edit' ? 'move' : 'default';
            
            // Update CSS classes
            if (mode === 'edit') {
                text.classList.add('draggable');
            } else {
                text.classList.remove('draggable');
            }
        });
    }

    handleMouseDown(e) {
        const svg = document.getElementById('trackCanvas');
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.currentMode === 'curve') {
            const element = e.target;
            if (element.classList.contains('segment-line')) {
                this.handleCurveSelection(element);
            }
        } else if (this.currentMode === 'outline') {
            const element = e.target;
            if (element.classList.contains('segment-line')) {
                this.handleTrackOutlineSelection(element);
            }
        } else if (this.currentMode === 'edit') {
            const element = e.target;
            if (element.classList.contains('segment-line') || element.classList.contains('segment-number')) {
                this.startSegmentDrag(element, x, y);
            }
        } else if (this.currentMode === 'pan') {
            this.isDragging = true;
            this.lastPanX = x;
            this.lastPanY = y;
            svg.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(e) {
        // Store the last mouse event for drag operations
        this.lastMouseEvent = e;
        
        const svg = document.getElementById('trackCanvas');
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.currentMode === 'edit' && this.isDragging && this.draggedSegmentId) {
            this.updateSegmentDragPreview(x, y);
        } else if (this.currentMode === 'pan' && this.isDragging) {
            const deltaX = x - this.lastPanX;
            const deltaY = y - this.lastPanY;
            
            this.panX += deltaX;
            this.panY += deltaY;
            
            const trackGroup = svg.querySelector('#trackGroup');
            if (trackGroup) {
                trackGroup.setAttribute('transform', 
                    `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
            }
            
            this.lastPanX = x;
            this.lastPanY = y;
        }
    }

    handleMouseUp() {
        if (this.currentMode === 'edit' && this.isDragging && this.draggedSegmentId) {
            this.finishSegmentDrag();
        } else {
            this.isDragging = false;
            const svg = document.getElementById('trackCanvas');
            svg.style.cursor = this.currentMode === 'pan' ? 'grab' : 'crosshair';
        }
    }

    handleWheel(e) {
        e.preventDefault();
        
        const svg = document.getElementById('trackCanvas');
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(5, this.scale * scaleFactor));
        
        const scaleChange = newScale / this.scale;
        this.panX = x - (x - this.panX) * scaleChange;
        this.panY = y - (y - this.panY) * scaleChange;
        this.scale = newScale;
        
        const trackGroup = svg.querySelector('#trackGroup');
        if (trackGroup) {
            trackGroup.setAttribute('transform', 
                `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
        }
    }

    handleCurveSelection(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        segment.is_curve = !segment.is_curve;
        if (segment.is_curve) {
            segment.speed_limit = segment.speed_limit || parseInt(document.getElementById('speedLimit').value);
        }
        
        this.updateSegmentVisual(segmentId, segment);
        this.showStatus(`Segment ${segmentId} ${segment.is_curve ? 'marked as curve' : 'unmarked as curve'}`, 'success');
    }

    handleTrackOutlineSelection(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        segment.has_track_outline = !segment.has_track_outline;
        this.renderTrack(true); // Preserve view when toggling outline
        this.showStatus(`Segment ${segmentId} ${segment.has_track_outline ? 'track outline added' : 'track outline removed'}`, 'success');
    }

    updateSegmentVisual(segmentId, segment) {
        const svg = document.getElementById('trackCanvas');
        const trackGroup = svg.querySelector('#trackGroup');
        if (!trackGroup) return;
        
        const visualLine = trackGroup.querySelector(`[data-segment-id="${segmentId}"].segment-line-visual`);
        const speedTextId = `speed-text-${segmentId}`;
        let speedText = trackGroup.querySelector(`#${speedTextId}`);
        
        if (visualLine) {
            visualLine.setAttribute('stroke-width', this.getSegmentStrokeWidth(segment.is_curve));
            
            if (segment.is_curve) {
                if (!speedText) {
                    speedText = this.createSpeedLimitText(segment, trackGroup);
                } else {
                    speedText.setAttribute('font-size', this.visualSettings.speedLimitSize);
                    speedText.textContent = segment.speed_limit;
                }
            } else {
                if (speedText) speedText.remove();
            }
        }
    }

    startSegmentDrag(element, x, y) {
        this.isDragging = true;
        this.dragStartX = x;
        this.dragStartY = y;
        
        // Get segment ID from element or its parent
        let segmentId = element.getAttribute('data-segment-id');
        if (!segmentId && element.classList.contains('segment-number')) {
            // If clicked on segment number, find the corresponding segment line
            const segmentNumber = element.textContent;
            segmentId = segmentNumber;
        }
        
        this.draggedSegmentId = parseInt(segmentId);
        this.draggedElement = element;
        
        // Visual feedback - make the segment semi-transparent during drag
        const svg = document.getElementById('trackCanvas');
        const trackGroup = svg.querySelector('#trackGroup');
        const segmentElements = trackGroup.querySelectorAll(`[data-segment-id="${segmentId}"]`);
        segmentElements.forEach(el => {
            el.classList.add('segment-being-dragged');
        });
        
        svg.style.cursor = 'grabbing';
        this.showStatus(`Dragging segment ${segmentId}...`, 'success');
    }

    updateSegmentDragPreview(x, y) {
        if (!this.draggedSegmentId || !this.trackData) return;

        // Convert screen coordinates to SVG coordinates
        const svgPoint = this.screenToSVGCoordinates(x, y);

        // Find the closest point on the centerline
        const closestPoint = this.findClosestPointOnCenterline(svgPoint.x, svgPoint.y);
        
        if (closestPoint) {
            // Update visual preview of where the segment would be placed
            this.showSegmentDragPreview(closestPoint);
        }
    }

    screenToSVGCoordinates(screenX, screenY) {
        // Convert screen coordinates to SVG space coordinates
        const svg = document.getElementById('trackCanvas');
        const rect = svg.getBoundingClientRect();
        
        // Convert from SVG element pixels to viewBox coordinates  
        const viewBoxX = screenX * (this.viewBoxWidth / rect.width);
        const viewBoxY = screenY * (this.viewBoxHeight / rect.height);
        
        // Remove the track group's transform (translate + scale)
        const trackX = (viewBoxX - this.panX) / this.scale;
        const trackY = (viewBoxY - this.panY) / this.scale;
        
        return { x: trackX, y: trackY };
    }

    findClosestPointOnCenterline(x, y) {
        if (!this.trackData || !this.trackData.centerline) return null;
        
        let closestDistance = Infinity;
        let closestIndex = -1;
        let closestPoint = null;
        
        for (let i = 0; i < this.trackData.centerline.length; i++) {
            const point = this.trackData.centerline[i];
            const distance = Math.sqrt(
                Math.pow(point[0] - x, 2) + Math.pow(point[1] - y, 2)
            );
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = i;
                closestPoint = point;
            }
        }
        
        return {
            point: closestPoint,
            index: closestIndex,
            distance: closestDistance
        };
    }

    showSegmentDragPreview(closestPoint) {
        const svg = document.getElementById('trackCanvas');
        let previewGroup = svg.querySelector('#dragPreview');
        
        if (!previewGroup) {
            previewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            previewGroup.id = 'dragPreview';
            svg.appendChild(previewGroup);
        } else {
            previewGroup.innerHTML = '';
        }
        
        if (!closestPoint || !closestPoint.point) return;
        
        // Create preview circle at the drop location
        const previewCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        previewCircle.setAttribute('cx', closestPoint.point[0]);
        previewCircle.setAttribute('cy', closestPoint.point[1]);
        previewCircle.setAttribute('r', '15');
        previewCircle.setAttribute('fill', 'yellow');
        previewCircle.setAttribute('stroke', 'orange');
        previewCircle.setAttribute('stroke-width', '3');
        previewCircle.setAttribute('opacity', '0.7');
        previewCircle.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
        previewGroup.appendChild(previewCircle);
    }

    finishSegmentDrag() {
        if (!this.draggedSegmentId || !this.trackData) {
            this.cancelSegmentDrag();
            return;
        }
        
        const svg = document.getElementById('trackCanvas');
        const rect = svg.getBoundingClientRect();
        
        // Use the last mouse position from the stored event
        if (this.lastMouseEvent) {
            const currentX = this.lastMouseEvent.clientX - rect.left;
            const currentY = this.lastMouseEvent.clientY - rect.top;
            
            // Convert to SVG coordinates
            const svgPoint = this.screenToSVGCoordinates(currentX, currentY);
            const closestPoint = this.findClosestPointOnCenterline(svgPoint.x, svgPoint.y);
            
            if (closestPoint) {
                this.moveSegmentToPosition(this.draggedSegmentId, closestPoint);
            }
        }
        
        this.cancelSegmentDrag();
    }

    moveSegmentToPosition(segmentId, closestPoint) {
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment || !closestPoint) return;
        
        // Calculate new position based on closest point on centerline
        const centerlineIndex = closestPoint.index;
        const segmentLength = this.trackData.segment_length;
        
        // Calculate cumulative distance to this point
        let newDistance = 0;
        for (let i = 1; i <= centerlineIndex; i++) {
            const prev = this.trackData.centerline[i - 1];
            const curr = this.trackData.centerline[i];
            if (prev && curr) {
                const dist = Math.sqrt(
                    Math.pow(curr[0] - prev[0], 2) + Math.pow(curr[1] - prev[1], 2)
                );
                newDistance += dist;
            }
        }
        
        // Update segment position
        segment.distance = newDistance;
        segment.center_point = [closestPoint.point[0], closestPoint.point[1]];
        
        // Recalculate perpendicular line for the new position
        const direction = this.calculateDirectionAtPoint(centerlineIndex);
        const perpendicular = [-direction[1], direction[0]];
        const halfWidth = this.trackData.track_width / 2;
        
        segment.line_start = [
            segment.center_point[0] - perpendicular[0] * halfWidth,
            segment.center_point[1] - perpendicular[1] * halfWidth
        ];
        segment.line_end = [
            segment.center_point[0] + perpendicular[0] * halfWidth,
            segment.center_point[1] + perpendicular[1] * halfWidth
        ];
        
        // Re-render the track to show the updated position
        this.renderTrack(true); // Preserve view when moving segments
        
        this.showStatus(`Segment ${segmentId} moved to new position`, 'success');
    }

    calculateDirectionAtPoint(centerlineIndex) {
        if (!this.trackData || !this.trackData.centerline) return [1, 0];
        
        const points = this.trackData.centerline;
        let direction;
        
        if (centerlineIndex === 0) {
            // First point: use direction to next point
            const next = points[centerlineIndex + 1];
            const curr = points[centerlineIndex];
            direction = [next[0] - curr[0], next[1] - curr[1]];
        } else if (centerlineIndex === points.length - 1) {
            // Last point: use direction from previous point
            const curr = points[centerlineIndex];
            const prev = points[centerlineIndex - 1];
            direction = [curr[0] - prev[0], curr[1] - prev[1]];
        } else {
            // Middle points: average direction
            const prev = points[centerlineIndex - 1];
            const curr = points[centerlineIndex];
            const next = points[centerlineIndex + 1];
            
            const incoming = [curr[0] - prev[0], curr[1] - prev[1]];
            const outgoing = [next[0] - curr[0], next[1] - curr[1]];
            direction = [(incoming[0] + outgoing[0]) / 2, (incoming[1] + outgoing[1]) / 2];
        }
        
        return this.normalize(direction);
    }

    cancelSegmentDrag() {
        // Remove drag preview
        const svg = document.getElementById('trackCanvas');
        const previewGroup = svg.querySelector('#dragPreview');
        if (previewGroup) previewGroup.remove();
        
        // Restore opacity of dragged elements
        if (this.draggedSegmentId) {
            const trackGroup = svg.querySelector('#trackGroup');
            if (trackGroup) {
                const segmentElements = trackGroup.querySelectorAll(`[data-segment-id="${this.draggedSegmentId}"]`);
                segmentElements.forEach(el => {
                    el.classList.remove('segment-being-dragged');
                });
            }
        }
        
        // Reset drag state
        this.isDragging = false;
        this.draggedSegmentId = null;
        this.draggedElement = null;
        
        svg.style.cursor = 'crosshair';
    }

    createTrackOutlineForSegment(segment, group) {
        // Create outline on track borders for this segment
        const segmentProgress = segment.distance || 0;
        const totalLength = this.calculateTrackLength();
        const segmentLength = this.trackData.segment_length || 400;
        
        const startRatio = segmentProgress / totalLength;
        const endRatio = Math.min((segmentProgress + segmentLength) / totalLength, 1);
        
        const leftBorderSegment = this.getTrackBorderSegment(this.trackData.left_border, startRatio, endRatio);
        const rightBorderSegment = this.getTrackBorderSegment(this.trackData.right_border, startRatio, endRatio);
        
        if (leftBorderSegment.length > 1) {
            this.createOutlinePath(leftBorderSegment, `left-outline-${segment.segment_number}`, group);
        }
        if (rightBorderSegment.length > 1) {
            this.createOutlinePath(rightBorderSegment, `right-outline-${segment.segment_number}`, group);
        }
    }

    getTrackBorderSegment(borderPoints, startRatio, endRatio) {
        const startIndex = Math.floor(startRatio * (borderPoints.length - 1));
        const endIndex = Math.floor(endRatio * (borderPoints.length - 1));
        return borderPoints.slice(startIndex, endIndex + 1);
    }

    createOutlinePath(points, id, group) {
        if (points.length < 2) return;
        
        const pathData = points.map((point, index) => 
            `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`
        ).join(' ');
        
        // Red dashed outline
        const redPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        redPath.setAttribute('d', pathData);
        redPath.setAttribute('stroke', 'red');
        redPath.setAttribute('stroke-width', this.visualSettings.trackOutlineWidth);
        redPath.setAttribute('stroke-dasharray', `${this.visualSettings.trackOutlineDashLength} ${this.visualSettings.trackOutlineGapLength}`);
        redPath.setAttribute('fill', 'none');
        redPath.style.pointerEvents = 'none';
        group.appendChild(redPath);
    }

    calculateTrackLength() {
        if (!this.trackData || !this.trackData.centerline) return 1000;
        
        let length = 0;
        for (let i = 1; i < this.trackData.centerline.length; i++) {
            const prev = this.trackData.centerline[i - 1];
            const curr = this.trackData.centerline[i];
            const dx = curr[0] - prev[0];
            const dy = curr[1] - prev[1];
            length += Math.sqrt(dx * dx + dy * dy);
        }
        return length;
    }

    // Export methods
    exportTrack(format) {
        if (!this.trackData) {
            this.showStatus('No track to export', 'error');
            return;
        }

        const svg = document.getElementById('trackCanvas');
        
        if (format === 'svg') {
            this.exportSVG(svg);
        } else if (format === 'png') {
            this.exportPNG(svg);
        }
    }

    exportSVG(svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'heat_track.svg';
        link.click();
        
        URL.revokeObjectURL(url);
        this.showStatus('Track exported as SVG', 'success');
    }

    exportPNG(svg) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = 2000;
        canvas.height = 1600;
        
        const svgData = new XMLSerializer().serializeToString(svg);
        const img = new Image();
        
        img.onload = () => {
            ctx.fillStyle = '#555';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'heat_track.png';
                link.click();
                URL.revokeObjectURL(url);
                this.showStatus('Track exported as PNG', 'success');
            });
        };
        
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        img.src = svgUrl;
    }

    // Utility methods
    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    // Debug function to visualize points
    showDebugPoint(point, type = 'debug', color = 'red') {
        const svg = document.getElementById('trackCanvas');
        let debugGroup = svg.querySelector('#debugGroup');
        
        if (!debugGroup) {
            debugGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            debugGroup.id = 'debugGroup';
            svg.appendChild(debugGroup);
        }
        
        // Remove previous debug points of the same type
        const existingPoints = debugGroup.querySelectorAll(`[data-debug-type="${type}"]`);
        existingPoints.forEach(el => el.remove());
        
        // Create debug circle
        const debugCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        debugCircle.setAttribute('cx', point.x);
        debugCircle.setAttribute('cy', point.y);
        debugCircle.setAttribute('r', '8');
        debugCircle.setAttribute('fill', color);
        debugCircle.setAttribute('stroke', 'white');
        debugCircle.setAttribute('stroke-width', '2');
        debugCircle.setAttribute('opacity', '0.8');
        debugCircle.setAttribute('data-debug-type', type);
        debugCircle.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
        debugCircle.style.pointerEvents = 'none';
        debugGroup.appendChild(debugCircle);
        
        // Create debug text showing coordinates
        const debugText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        debugText.setAttribute('x', point.x + 15);
        debugText.setAttribute('y', point.y - 10);
        debugText.setAttribute('fill', color);
        debugText.setAttribute('font-size', '12');
        debugText.setAttribute('font-weight', 'bold');
        debugText.setAttribute('stroke', 'white');
        debugText.setAttribute('stroke-width', '0.5');
        debugText.setAttribute('data-debug-type', type);
        debugText.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
        debugText.style.pointerEvents = 'none';
        debugText.textContent = `${type}: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`;
        debugGroup.appendChild(debugText);
        
        // Auto-remove debug point after 3 seconds
        setTimeout(() => {
            debugCircle.remove();
            debugText.remove();
        }, 3000);
        
        console.log(`Debug ${type} point:`, point);
    }

    clearDebugPoints() {
        const svg = document.getElementById('trackCanvas');
        const debugGroup = svg.querySelector('#debugGroup');
        if (debugGroup) {
            debugGroup.remove();
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new HeatTrackGenerator();
});
