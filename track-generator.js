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
            segmentNumberOffset: 30, // Distance to offset numbers from centerline
            speedLimitSize: 64,
            normalSegmentWidth: 8,
            curveSegmentWidth: 25,
            borderWidth: 5,
            borderOffset: 1.0,
            centerlineWidth: 10,
            dashLength: 25,
            gapLength: 25,
            kerbWidth: 6,
            kerbDashLength: 15,
            kerbGapLength: 10,
            whiteLineWidth: 20,
        };
        
        // Load saved settings or use defaults
        this.visualSettings = this.loadVisualSettings();
        
        this.initializeEventListeners();
        this.setupSVGInteraction();
        
        // Try to restore previous session
        this.restoreSession();
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
        document.getElementById('kerbMode').addEventListener('click', () => this.setMode('kerb'));
        document.getElementById('whiteLineMode').addEventListener('click', () => this.setMode('whiteLine'));

        // Export buttons
        document.getElementById('exportPNG').addEventListener('click', () => this.exportTrack('png'));
        document.getElementById('exportSVG').addEventListener('click', () => this.exportTrack('svg'));

        // Session management
        document.getElementById('clearSession').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the saved session? This will remove the current map and reset the view.')) {
                this.clearSession();
                location.reload(); // Refresh the page to show the cleared state
            }
        });

        // Settings change listeners
        document.getElementById('trackWidth').addEventListener('change', this.onSettingChange.bind(this));
        document.getElementById('segmentLength').addEventListener('change', this.onSettingChange.bind(this));
        
        // Visual settings listeners
        document.getElementById('segmentNumberSize').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('segmentNumberOffset').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('speedLimitSize').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('normalSegmentWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('curveSegmentWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('borderWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('borderOffset').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('centerlineWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('dashLength').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('gapLength').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('kerbWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('kerbDashLength').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('kerbGapLength').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('whiteLineWidth').addEventListener('change', this.onVisualSettingChange.bind(this));
        
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
        
        // Save session after loading centerline
        this.saveSession();
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
            
            // Calculate spaces to next curve for each segment
            this.calculateSpacesToNextCurve();
            
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
            
            // Save session after successful track generation
            this.saveSession();
            
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
            
            segmentDivisions.push({
                segment_number: i + 1,
                centerline_index: distanceIndex,
                interpolation_t: clampedT,
                distance: targetDistance,
                is_curve: false,
                speed_limit: 0,
                has_kerb: true,
                kerb_side: 'both', // 'left', 'right', or 'both'
                has_white_line: true,
                white_line_side: 'right', // 'left' or 'right'
                number_side: 'left', // 'left' or 'right' - which side to show numbers
                targetCurveId: null // Will be set by calculateSpacesToNextCurve
            });
        }
        
        // Check for closed track and remove last segment if too close to first
        if (segmentDivisions.length > 1) {
            const first = segmentDivisions[0];
            const last = segmentDivisions[segmentDivisions.length - 1];
            
            // Calculate center points for distance comparison
            const firstCenterPoint = this.interpolatePointOnCenterline(first.centerline_index, first.interpolation_t);
            const lastCenterPoint = this.interpolatePointOnCenterline(last.centerline_index, last.interpolation_t);
            
            if (firstCenterPoint && lastCenterPoint) {
                const distanceToFirst = Math.sqrt(
                    Math.pow(lastCenterPoint[0] - firstCenterPoint[0], 2) +
                    Math.pow(lastCenterPoint[1] - firstCenterPoint[1], 2)
                );
                
                const minDistance = segmentLength * MIN_SEGMENT_DISTANCE_RATIO;
                if (distanceToFirst < minDistance) {
                    segmentDivisions.pop();
                    console.log(`Removed last segment due to insufficient distance (${distanceToFirst.toFixed(2)}) to first segment`);
                }
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

    // Calculate spaces to next curve for each segment
    calculateSpacesToNextCurve() {
        if (!this.segmentDivisions || this.segmentDivisions.length === 0) {
            return;
        }

        // First pass: calculate spaces to next curve
        this.segmentDivisions.forEach((segment, index) => {
            let spacesToNextCurve = 0;
            let foundCurve = false;
            let targetCurveSegment = null;
            
            // Look ahead from current segment to find next curve
            for (let i = 1; i < this.segmentDivisions.length; i++) {
                const nextIndex = (index + i) % this.segmentDivisions.length;
                const nextSegment = this.segmentDivisions[nextIndex];
                
                if (nextSegment.is_curve) {
                    spacesToNextCurve = i - 1; // -1 because we don't count the curve segment itself
                    foundCurve = true;
                    targetCurveSegment = nextSegment;
                    break;
                }
                
                // If we've gone full circle without finding a curve, break
                if (nextIndex === index) {
                    break;
                }
            }
            
            // If no curve found in the entire track, set to null or -1
            segment.spacesToNextCurve = foundCurve ? spacesToNextCurve : null;
            segment.targetCurveId = targetCurveSegment ? targetCurveSegment.segment_number : null;
        });
        
        // Second pass: group segments by target curve and assign consistent number_side
        this.groupNumbersByTargetCurve();
    }
    
    // Group segments that point to the same curve and assign consistent number_side
    groupNumbersByTargetCurve() {
        if (!this.segmentDivisions) return;
        
        // Get all unique target curves
        const targetCurves = [...new Set(this.segmentDivisions
            .filter(s => s.targetCurveId !== null)
            .map(s => s.targetCurveId))];
        
        // For each target curve, ensure all segments pointing to it have the same number_side
        targetCurves.forEach(curveId => {
            const segmentsPointingToCurve = this.segmentDivisions.filter(s => s.targetCurveId === curveId);
            
            if (segmentsPointingToCurve.length > 0) {
                // Use the number_side of the first segment (or default to 'left' if not set)
                const consistentSide = segmentsPointingToCurve[0].number_side || 'left';
                
                // Apply this side to all segments pointing to this curve
                segmentsPointingToCurve.forEach(segment => {
                    segment.number_side = consistentSide;
                });
            }
        });
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
        this.renderCenterline(trackGroup);
        this.renderSegmentDivisions(trackGroup);
        this.renderKerbs(trackGroup);
        this.renderWhiteLines(trackGroup);

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
        // Instead of rendering one big track fill, render individual clickable segments
        this.renderClickableTrackSegments(group);
    }

    renderClickableTrackSegments(group) {
        this.trackData.segments.forEach(segment => {
            // Calculate the segment's portion of the track fill
            const segmentFillPath = this.createSegmentFillPath(segment);
            if (!segmentFillPath) return;

            const segmentFill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            segmentFill.setAttribute('d', segmentFillPath);
            segmentFill.setAttribute('fill', 'black');
            segmentFill.setAttribute('stroke', 'none');
            segmentFill.setAttribute('class', 'segment-fill');
            segmentFill.setAttribute('data-segment-id', segment.segment_number);
            segmentFill.style.cursor = this.getCursorForMode();
            segmentFill.style.pointerEvents = 'auto';
            
            group.appendChild(segmentFill);
        });
    }

    createSegmentFillPath(segment) {
        // Use actual segment distances to calculate boundaries, not array indices
        const allSegments = [...this.trackData.segments].sort((a, b) => (a.distance || 0) - (b.distance || 0));
        const segmentIndex = allSegments.findIndex(s => s.segment_number === segment.segment_number);
        const totalLength = this.calculateTrackLength();
        
        // Calculate actual boundaries based on segment positions
        let startDistance = 0;
        let endDistance = segment.distance || 0;
        
        // Start distance is the position of the previous segment (if any)
        if (segmentIndex > 0) {
            startDistance = allSegments[segmentIndex - 1].distance || 0;
        }
        
        // End distance is the position of the next segment (if any), otherwise track end
        if (segmentIndex < allSegments.length - 1) {
            endDistance = allSegments[segmentIndex + 1].distance || 0;
        } else {
            endDistance = totalLength;
        }
        
        const startRatio = startDistance / totalLength;
        const endRatio = endDistance / totalLength;
        
        // Get border points for this segment range
        const leftBorderLength = this.trackData.left_border.length;
        const rightBorderLength = this.trackData.right_border.length;
        
        const leftStartIndex = Math.floor(startRatio * (leftBorderLength - 1));
        const leftEndIndex = Math.min(Math.ceil(endRatio * (leftBorderLength - 1)), leftBorderLength - 1);
        const rightStartIndex = Math.floor(startRatio * (rightBorderLength - 1));
        const rightEndIndex = Math.min(Math.ceil(endRatio * (rightBorderLength - 1)), rightBorderLength - 1);
        
        // Get the points for this segment from the track borders
        const leftBorderPoints = this.trackData.left_border.slice(leftStartIndex, leftEndIndex + 1);
        const rightBorderPoints = this.trackData.right_border.slice(rightStartIndex, rightEndIndex + 1);
        
        if (!leftBorderPoints.length || !rightBorderPoints.length) return null;
        
        // Create path: start from left border, go to end of left border, then reverse along right border back to start
        const allPoints = [
            ...leftBorderPoints,
            ...rightBorderPoints.slice().reverse()
        ];
        
        const pathData = allPoints.map((point, index) => 
            `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`
        ).join(' ') + ' Z';
        
        return pathData;
    }

    renderTrackBorders(group) {
        // Calculate track borders at configurable distance from centerline
        const borderDistance = (this.trackData.track_width / 2) * this.visualSettings.borderOffset;
        
        // Generate left and right border points based on centerline and configurable offset
        const leftBorderPoints = this.createParallelLine(this.trackData.centerline, borderDistance, 'left');
        const rightBorderPoints = this.createParallelLine(this.trackData.centerline, borderDistance, 'right');
        
        // Left border
        const leftPath = this.createPathFromPoints(leftBorderPoints);
        leftPath.setAttribute('stroke', 'white');
        leftPath.setAttribute('stroke-width', this.visualSettings.borderWidth);
        leftPath.setAttribute('fill', 'none');
        group.appendChild(leftPath);

        // Right border
        const rightPath = this.createPathFromPoints(rightBorderPoints);
        rightPath.setAttribute('stroke', 'white');
        rightPath.setAttribute('stroke-width', this.visualSettings.borderWidth);
        rightPath.setAttribute('fill', 'none');
        group.appendChild(rightPath);
    }

    renderKerbs(group) {
        // Group contiguous kerb segments and render them as unified kerbs
        const kerbSegments = this.trackData.segments.filter(s => s.has_kerb);
        const contiguousGroups = this.groupContiguousKerbSegments(kerbSegments);
        
        contiguousGroups.forEach(kerbGroup => {
            this.createUnifiedKerbForGroup(kerbGroup, group);
        });
    }

    groupContiguousKerbSegments(kerbSegments) {
        if (kerbSegments.length === 0) return [];
        
        // Sort segments by their segment number (not distance) for kerbs
        const sortedSegments = [...kerbSegments].sort((a, b) => a.segment_number - b.segment_number);
        
        const groups = [];
        let currentGroup = {
            segments: [sortedSegments[0]],
            segmentSides: new Map([[sortedSegments[0].segment_number, sortedSegments[0].kerb_side]])
        };
        
        for (let i = 1; i < sortedSegments.length; i++) {
            const currentSegment = sortedSegments[i];
            const previousSegment = currentGroup.segments[currentGroup.segments.length - 1];
            
            // For kerbs, only group if segments are consecutive by number AND have overlapping sides
            const isConsecutive = (currentSegment.segment_number === previousSegment.segment_number + 1);
            const overlappingSides = this.doKerbSidesOverlap(previousSegment.kerb_side, currentSegment.kerb_side);
            
            if (isConsecutive && overlappingSides) {
                // Add to current group and track what sides this segment contributes
                currentGroup.segments.push(currentSegment);
                currentGroup.segmentSides.set(currentSegment.segment_number, currentSegment.kerb_side);
            } else {
                // Start new group
                groups.push(currentGroup);
                currentGroup = {
                    segments: [currentSegment],
                    segmentSides: new Map([[currentSegment.segment_number, currentSegment.kerb_side]])
                };
            }
        }
        
        // Add the last group
        groups.push(currentGroup);
        
        return groups;
    }

    areSegmentsContiguous(segment1, segment2) {
        // Check if segments are consecutive by segment number
        if (Math.abs(segment1.segment_number - segment2.segment_number) === 1) {
            return true;
        }
        
        // Special case: handle wrapping from last segment to first segment (for circular tracks)
        const totalSegments = this.trackData.segments.length;
        if ((segment1.segment_number === 1 && segment2.segment_number === totalSegments) ||
            (segment1.segment_number === totalSegments && segment2.segment_number === 1)) {
            return true;
        }
        
        // Check if segments are very close in distance (allowing for small gaps)
        const distance1 = segment1.distance || 0;
        const distance2 = segment2.distance || 0;
        const segmentLength = this.trackData.segment_length || 400;
        const maxGap = segmentLength * 1.5; // Allow up to 1.5x segment length gap
        
        return Math.abs(distance2 - distance1) <= maxGap;
    }

    doKerbSidesOverlap(side1, side2) {
        // Check if two kerb sides have any overlap
        if (side1 === 'both' || side2 === 'both') return true;
        if (side1 === side2) return true;
        return false;
    }

    createUnifiedKerbForGroup(kerbGroup, group) {
        // Calculate the combined boundaries of all segments in the group
        const segments = kerbGroup.segments;
        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];
        
        // Calculate the start and end positions
        const startDistance = firstSegment.distance || 0;
        
        // For end distance, calculate the actual end of the last segment
        const lastSegmentIndex = this.trackData.segments.findIndex(s => s.segment_number === lastSegment.segment_number);
        const nextSegment = this.trackData.segments[lastSegmentIndex + 1];
        
        let endDistance;
        if (nextSegment) {
            endDistance = nextSegment.distance || 0;
        } else {
            // For the last segment, use the total track length to extend to the end
            const totalLength = this.calculateTrackLength();
            endDistance = totalLength;
        }
        
        const totalLength = this.calculateTrackLength();
        const startRatio = startDistance / totalLength;
        const endRatio = Math.min(endDistance / totalLength, 1);
        
        // Determine which sides to render based on segment-by-segment analysis
        const sidesToRender = this.calculateKerbSidesToRender(kerbGroup, startRatio, endRatio);
        
        // Calculate border distance
        const borderDistance = (this.trackData.track_width / 2) * this.visualSettings.borderOffset;
        
        // Create unified kerb paths for each continuous side
        sidesToRender.forEach(sideInfo => {
            this.createUnifiedKerbPath(sideInfo.startRatio, sideInfo.endRatio, sideInfo.side, borderDistance, group, `${firstSegment.segment_number}-${sideInfo.side}`);
        });
    }

    calculateKerbSidesToRender(kerbGroup, groupStartRatio, groupEndRatio) {
        const segments = kerbGroup.segments;
        const totalLength = this.calculateTrackLength();
        const sidesToRender = [];
        
        // Track continuous runs of each side
        let leftRuns = [];
        let rightRuns = [];
        let currentLeftRun = null;
        let currentRightRun = null;
        
        segments.forEach((segment, index) => {
            const segmentSide = kerbGroup.segmentSides.get(segment.segment_number);
            const segmentStartDistance = segment.distance || 0;
            
            // Calculate end distance for this segment
            let segmentEndDistance;
            if (index < segments.length - 1) {
                segmentEndDistance = segments[index + 1].distance || 0;
            } else {
                // Last segment in group
                const lastSegmentIndex = this.trackData.segments.findIndex(s => s.segment_number === segment.segment_number);
                const nextSegment = this.trackData.segments[lastSegmentIndex + 1];
                if (nextSegment) {
                    segmentEndDistance = nextSegment.distance || 0;
                } else {
                    segmentEndDistance = totalLength;
                }
            }
            
            const segmentStartRatio = segmentStartDistance / totalLength;
            const segmentEndRatio = segmentEndDistance / totalLength;
            
            // Check if this segment has left side kerb
            const hasLeft = (segmentSide === 'left' || segmentSide === 'both');
            if (hasLeft) {
                if (!currentLeftRun) {
                    currentLeftRun = { startRatio: segmentStartRatio, endRatio: segmentEndRatio };
                } else {
                    currentLeftRun.endRatio = segmentEndRatio;
                }
            } else {
                if (currentLeftRun) {
                    leftRuns.push({ ...currentLeftRun, side: 'left' });
                    currentLeftRun = null;
                }
            }
            
            // Check if this segment has right side kerb
            const hasRight = (segmentSide === 'right' || segmentSide === 'both');
            if (hasRight) {
                if (!currentRightRun) {
                    currentRightRun = { startRatio: segmentStartRatio, endRatio: segmentEndRatio };
                } else {
                    currentRightRun.endRatio = segmentEndRatio;
                }
            } else {
                if (currentRightRun) {
                    rightRuns.push({ ...currentRightRun, side: 'right' });
                    currentRightRun = null;
                }
            }
        });
        
        // Close any remaining runs
        if (currentLeftRun) {
            leftRuns.push({ ...currentLeftRun, side: 'left' });
        }
        if (currentRightRun) {
            rightRuns.push({ ...currentRightRun, side: 'right' });
        }
        
        return [...leftRuns, ...rightRuns];
    }

    createUnifiedKerbPath(startRatio, endRatio, side, borderDistance, group, groupId) {
        // Get the centerline segment for the unified kerb
        const centerlineStartIndex = Math.floor(startRatio * (this.trackData.centerline.length - 1));
        const centerlineEndIndex = Math.ceil(endRatio * (this.trackData.centerline.length - 1));
        
        const centerlineSegment = this.trackData.centerline.slice(centerlineStartIndex, centerlineEndIndex + 1);
        
        if (centerlineSegment.length < 2) return;
        
        // Calculate the kerb offset
        const borderStrokeWidth = this.visualSettings.borderWidth || 2;
        const kerbOffset = borderDistance - (borderStrokeWidth / 2) + (this.visualSettings.kerbWidth / 2);
        
        // Create kerb path at the correct distance from centerline
        const kerbPoints = this.createParallelLine(centerlineSegment, kerbOffset, side);
        
        if (kerbPoints.length > 1) {
            this.createKerbPath(kerbPoints, `unified-${side}-kerb-group-${groupId}`, group);
        }
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

    interpolatePointOnCenterline(centerlineIndex, t) {
        if (!this.centerlinePoints || centerlineIndex >= this.centerlinePoints.length - 1) {
            return null;
        }
        
        const p1 = this.centerlinePoints[centerlineIndex];
        const p2 = this.centerlinePoints[centerlineIndex + 1];
        
        return [
            p1[0] + t * (p2[0] - p1[0]),
            p1[1] + t * (p2[1] - p1[1])
        ];
    }

    calculateSegmentLineCoordinates(segment) {
        if (!this.trackData || !this.trackData.centerline) return null;
        
        const centerlineIndex = segment.centerline_index;
        const t = segment.interpolation_t;
        const halfWidth = (this.trackData.track_width / 2) * this.visualSettings.borderOffset;
        
        // Ensure we don't go out of bounds
        if (centerlineIndex >= this.trackData.centerline.length - 1) {
            console.warn(`Segment ${segment.segment_number}: centerline index out of bounds`);
            return null;
        }
        
        const p1 = this.trackData.centerline[centerlineIndex];
        const p2 = this.trackData.centerline[centerlineIndex + 1];
        
        // Interpolated point on centerline
        const centerPoint = [
            p1[0] + t * (p2[0] - p1[0]),
            p1[1] + t * (p2[1] - p1[1])
        ];
        
        // Calculate direction for perpendicular
        const direction = this.normalize([p2[0] - p1[0], p2[1] - p1[1]]);
        
        // Handle case where direction is zero (duplicate points)
        if (direction[0] === 0 && direction[1] === 0) {
            console.warn(`Zero direction vector at segment ${segment.segment_number}, using default direction`);
            direction[0] = 1; // Default to horizontal direction
        }
        
        const perpendicular = [-direction[1], direction[0]];
        
        return {
            center_point: centerPoint,
            line_start: [
                centerPoint[0] - perpendicular[0] * halfWidth,
                centerPoint[1] - perpendicular[1] * halfWidth
            ],
            line_end: [
                centerPoint[0] + perpendicular[0] * halfWidth,
                centerPoint[1] + perpendicular[1] * halfWidth
            ]
        };
    }

    // Calculate the position for segment numbers with perpendicular offset from centerline
    calculateSegmentNumberPosition(segment) {
        if (!this.trackData || !this.trackData.segments || !this.centerlinePoints) return null;
        
        const currentSegmentIndex = this.trackData.segments.findIndex(s => s.segment_number === segment.segment_number);
        if (currentSegmentIndex === -1) return null;
        
        // Get the next segment (with wrapping for closed tracks)
        const nextSegmentIndex = (currentSegmentIndex + 1) % this.trackData.segments.length;
        const nextSegment = this.trackData.segments[nextSegmentIndex];
        
        // Calculate distances along the centerline for both segments
        const currentDistance = segment.distance || 0;
        const nextDistance = nextSegment.distance || 0;
        
        // Calculate the midpoint distance between segments
        let midDistance;
        if (nextDistance > currentDistance) {
            // Normal case - next segment is further along
            midDistance = (currentDistance + nextDistance) / 2;
        } else {
            // Wrap-around case for closed tracks
            const totalLength = this.calculateTrackLength();
            const adjustedNextDistance = nextDistance + totalLength;
            midDistance = (currentDistance + adjustedNextDistance) / 2;
            if (midDistance > totalLength) {
                midDistance -= totalLength;
            }
        }
        
        // Find the point on the centerline at this distance and get direction
        const centerlineInfo = this.findPointAndDirectionAtDistance(midDistance);
        if (!centerlineInfo) return null;
        
        // Calculate perpendicular offset
        const offsetDistance = this.visualSettings.segmentNumberOffset || 30;
        const perpendicular = [-centerlineInfo.direction[1], centerlineInfo.direction[0]]; // Rotate 90 degrees
        
        // Apply offset based on the segment's number_side preference
        const sideMultiplier = (segment.number_side === 'right') ? -1 : 1;
        const offsetPosition = [
            centerlineInfo.point[0] + perpendicular[0] * offsetDistance * sideMultiplier,
            centerlineInfo.point[1] + perpendicular[1] * offsetDistance * sideMultiplier
        ];
        
        return offsetPosition;
    }
    
    // Find a point and direction at a specific distance along the centerline
    findPointAndDirectionAtDistance(targetDistance) {
        if (!this.centerlinePoints || this.centerlinePoints.length < 2) return null;
        
        // Calculate cumulative distances
        const distances = [0];
        for (let i = 1; i < this.centerlinePoints.length; i++) {
            const prev = this.centerlinePoints[i - 1];
            const curr = this.centerlinePoints[i];
            const dist = Math.sqrt(
                Math.pow(curr[0] - prev[0], 2) + 
                Math.pow(curr[1] - prev[1], 2)
            );
            distances.push(distances[distances.length - 1] + dist);
        }
        
        const totalLength = distances[distances.length - 1];
        
        // Handle wrap-around for closed tracks
        const normalizedDistance = targetDistance % totalLength;
        
        // Find the segment containing this distance
        for (let i = 0; i < distances.length - 1; i++) {
            if (normalizedDistance >= distances[i] && normalizedDistance <= distances[i + 1]) {
                // Interpolate between points i and i+1
                const segmentDistance = distances[i + 1] - distances[i];
                if (segmentDistance === 0) {
                    return {
                        point: this.centerlinePoints[i],
                        direction: [1, 0] // Default direction if no distance
                    };
                }
                
                const t = (normalizedDistance - distances[i]) / segmentDistance;
                const p1 = this.centerlinePoints[i];
                const p2 = this.centerlinePoints[i + 1];
                
                const point = [
                    p1[0] + t * (p2[0] - p1[0]),
                    p1[1] + t * (p2[1] - p1[1])
                ];
                
                // Calculate normalized direction vector
                const direction = this.normalize([p2[0] - p1[0], p2[1] - p1[1]]);
                
                return { point, direction };
            }
        }
        
        // Fallback to last point
        const lastIndex = this.centerlinePoints.length - 1;
        return {
            point: this.centerlinePoints[lastIndex],
            direction: lastIndex > 0 ? 
                this.normalize([
                    this.centerlinePoints[lastIndex][0] - this.centerlinePoints[lastIndex - 1][0],
                    this.centerlinePoints[lastIndex][1] - this.centerlinePoints[lastIndex - 1][1]
                ]) : [1, 0]
        };
    }

    createKerbHitAreas(segment, group) {
        // Only create kerb hit areas in kerb mode
        if (this.currentMode !== 'kerb') return;
        
        const segmentProgress = segment.distance || 0;
        const totalLength = this.calculateTrackLength();
        
        // Calculate actual segment length based on next segment position
        const currentSegmentIndex = this.trackData.segments.findIndex(s => s.segment_number === segment.segment_number);
        const nextSegment = this.trackData.segments[currentSegmentIndex + 1];
        
        let segmentLength;
        if (nextSegment) {
            // Use distance to next segment
            segmentLength = (nextSegment.distance || 0) - segmentProgress;
        } else {
            // Last segment: use remaining track length or default segment length
            const remainingLength = totalLength - segmentProgress;
            segmentLength = Math.min(remainingLength, this.trackData.segment_length || 400);
        }
        
        // Ensure positive segment length
        segmentLength = Math.max(segmentLength, 10); // Minimum 10 units
        
        const startRatio = segmentProgress / totalLength;
        const endRatio = Math.min((segmentProgress + segmentLength) / totalLength, 1);
        
        // Use white border distance for hit area positioning
        const borderDistance = (this.trackData.track_width / 2) * this.visualSettings.borderOffset;
        
        // Create hit areas at the white border positions
        const centerlineSegment = this.trackData.centerline.slice(
            Math.floor(startRatio * (this.trackData.centerline.length - 1)),
            Math.ceil(endRatio * (this.trackData.centerline.length - 1)) + 1
        );
        
        // Create clickable areas along the track borders
        const leftBorderSegment = this.createParallelLine(centerlineSegment, borderDistance, 'left');
        const rightBorderSegment = this.createParallelLine(centerlineSegment, borderDistance, 'right');
        
        if (leftBorderSegment.length > 1) {
            const leftPath = this.createPathFromPoints(leftBorderSegment);
            leftPath.setAttribute('stroke', 'transparent');
            leftPath.setAttribute('stroke-width', '20'); // Wide clickable area
            leftPath.setAttribute('fill', 'none');
            leftPath.setAttribute('opacity', '0');
            leftPath.setAttribute('class', 'kerb-hit-area');
            leftPath.setAttribute('data-segment-id', segment.segment_number);
            leftPath.setAttribute('data-kerb-side', 'left');
            leftPath.style.cursor = 'pointer';
            leftPath.style.pointerEvents = 'auto';
            group.appendChild(leftPath);
        }
        
        if (rightBorderSegment.length > 1) {
            const rightPath = this.createPathFromPoints(rightBorderSegment);
            rightPath.setAttribute('stroke', 'transparent');
            rightPath.setAttribute('stroke-width', '20'); // Wide clickable area
            rightPath.setAttribute('fill', 'none');
            rightPath.setAttribute('opacity', '0');
            rightPath.setAttribute('class', 'kerb-hit-area');
            rightPath.setAttribute('data-segment-id', segment.segment_number);
            rightPath.setAttribute('data-kerb-side', 'right');
            rightPath.style.cursor = 'pointer';
            rightPath.style.pointerEvents = 'auto';
            group.appendChild(rightPath);
        }
    }

    renderSegmentDivisions(group) {
        this.trackData.segments.forEach(segment => {
            // Calculate line coordinates dynamically
            const lineCoords = this.calculateSegmentLineCoordinates(segment);
            if (!lineCoords) return; // Skip if calculation failed

            // Create visible segment line
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', lineCoords.line_start[0]);
            line.setAttribute('y1', lineCoords.line_start[1]);
            line.setAttribute('x2', lineCoords.line_end[0]);
            line.setAttribute('y2', lineCoords.line_end[1]);
            line.setAttribute('stroke', 'white');
            line.setAttribute('stroke-width', this.getSegmentStrokeWidth(segment.is_curve));
            line.setAttribute('opacity', '1');
            line.setAttribute('class', 'segment-line-visual');
            line.setAttribute('data-segment-id', segment.segment_number);
            line.style.pointerEvents = 'none';
            group.appendChild(line);

            // Create invisible hit area for easier selection (for curve and edit modes)
            const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hitArea.setAttribute('x1', lineCoords.line_start[0]);
            hitArea.setAttribute('y1', lineCoords.line_start[1]);
            hitArea.setAttribute('x2', lineCoords.line_end[0]);
            hitArea.setAttribute('y2', lineCoords.line_end[1]);
            hitArea.setAttribute('stroke', 'transparent');
            hitArea.setAttribute('stroke-width', '25');
            hitArea.setAttribute('opacity', '0');
            hitArea.setAttribute('class', 'segment-line');
            hitArea.setAttribute('data-segment-id', segment.segment_number);
            hitArea.style.cursor = this.getCursorForMode();
            group.appendChild(hitArea);

            // Create kerb hit areas for kerb mode
            this.createKerbHitAreas(segment, group);
            
            // Create white line hit areas for white line mode
            this.createWhiteLineHitAreas(segment, group);

            // Add segment number with spaces to next curve
            const numberPosition = this.calculateSegmentNumberPosition(segment);
            if (!numberPosition) return; // Skip if position calculation failed
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', numberPosition[0]);
            text.setAttribute('y', numberPosition[1]);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', 'white');
            text.setAttribute('font-size', this.visualSettings.segmentNumberSize);
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('class', `segment-number ${this.currentMode === 'edit' ? 'draggable' : ''}`);
            text.setAttribute('data-segment-id', segment.segment_number);
            text.setAttribute('stroke', 'black');
            text.setAttribute('stroke-width', '0.5');
            text.style.pointerEvents = (this.currentMode === 'edit' || this.currentMode === 'curve') ? 'auto' : 'none';
            text.style.cursor = this.currentMode === 'edit' ? 'move' : (this.currentMode === 'curve' ? 'pointer' : 'default');
            
            // Show only spaces to next curve if available
            if (segment.spacesToNextCurve !== null && segment.spacesToNextCurve !== undefined) {
                text.textContent = `${segment.spacesToNextCurve}`;
            } else {
                // If no curve found or no spaces calculated, show nothing or a dash
                text.textContent = '';
            }
            
            group.appendChild(text);
            
            // Add speed limit text for curves
            if (segment.is_curve && segment.speed_limit) {
                this.createSpeedLimitText(segment, lineCoords.center_point, group);
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

    createSpeedLimitText(segment, centerPoint, group) {
        const speedText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        speedText.setAttribute('id', `speed-text-${segment.segment_number}`);
        speedText.setAttribute('x', centerPoint[0] + 20);
        speedText.setAttribute('y', centerPoint[1]);
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
            case 'kerb':
            case 'whiteLine': return 'pointer';
            case 'pan': return 'grab';
            default: return 'crosshair';
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
        const value = settingName === 'borderOffset' ? parseFloat(e.target.value) : parseInt(e.target.value);
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
        document.getElementById('kerbControls').style.display = mode === 'kerb' ? 'block' : 'none';
        document.getElementById('whiteLineControls').style.display = mode === 'whiteLine' ? 'block' : 'none';
        document.getElementById('editControls').style.display = mode === 'edit' ? 'block' : 'none';
        
        // Update cursors and pointer events
        const svg = document.getElementById('trackCanvas');
        svg.style.cursor = this.getCursorForMode();
        
        const segmentLines = svg.querySelectorAll('.segment-line');
        segmentLines.forEach(line => {
            line.style.cursor = this.getCursorForMode();
        });
        
        // Update segment number pointer events for edit and curve modes
        const segmentNumbers = svg.querySelectorAll('.segment-number');
        segmentNumbers.forEach(text => {
            text.style.pointerEvents = (mode === 'edit' || mode === 'curve') ? 'auto' : 'none';
            text.style.cursor = mode === 'edit' ? 'move' : (mode === 'curve' ? 'pointer' : 'default');
            
            // Update CSS classes
            if (mode === 'edit') {
                text.classList.add('draggable');
            } else {
                text.classList.remove('draggable');
            }
        });
        
        // Re-render track to update kerb hit areas based on new mode
        if (this.trackData) {
            this.renderTrack(true);
        }
    }

    handleMouseDown(e) {
        const svg = document.getElementById('trackCanvas');
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const element = e.target;
        let handledByMode = false;
        
        if (this.currentMode === 'curve') {
            if (element.classList.contains('segment-line')) {
                this.handleCurveSelection(element);
                handledByMode = true;
            } else if (element.classList.contains('segment-number')) {
                // In curve mode, clicking on numbers toggles their side
                this.handleNumberSideToggle(element);
                handledByMode = true;
            }
        } else if (this.currentMode === 'kerb') {
            if (element.classList.contains('kerb-hit-area')) {
                this.handleKerbAreaSelection(element);
                handledByMode = true;
            }
        } else if (this.currentMode === 'whiteLine') {
            if (element.classList.contains('white-line-hit-area')) {
                this.handleWhiteLineAreaSelection(element);
                handledByMode = true;
            }
        } else if (this.currentMode === 'edit') {
            if (element.classList.contains('segment-line') || element.classList.contains('segment-number')) {
                this.startSegmentDrag(element, x, y);
                handledByMode = true;
            }
        }
        
        // If no mode-specific interaction occurred, or we're in pan mode, allow panning
        if (!handledByMode || this.currentMode === 'pan') {
            // Check if we clicked on an interactive element (but not the background)
            const isInteractiveElement = element.classList.contains('segment-line') || 
                                       element.classList.contains('segment-number') || 
                                       element.classList.contains('kerb-hit-area') ||
                                       element.classList.contains('segment-fill');
            
            // Only start panning if we didn't click on an interactive element or we're in pan mode
            if (!isInteractiveElement || this.currentMode === 'pan') {
                this.isDragging = true;
                this.lastPanX = x;
                this.lastPanY = y;
                svg.style.cursor = 'grabbing';
            }
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
        } else if (this.isDragging && !this.draggedSegmentId) {
            // Handle panning regardless of current mode (when dragging but not dragging a segment)
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
            
            // Save session after panning (with debouncing)
            this.debouncedSaveSession();
        }
    }

    handleMouseUp() {
        if (this.currentMode === 'edit' && this.isDragging && this.draggedSegmentId) {
            this.finishSegmentDrag();
        } else if (this.isDragging) {
            // End panning (regardless of mode)
            this.isDragging = false;
            const svg = document.getElementById('trackCanvas');
            svg.style.cursor = this.getCursorForMode();
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
        
        // Save session after view changes (with debouncing)
        this.debouncedSaveSession();
    }

    handleCurveSelection(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        segment.is_curve = !segment.is_curve;
        if (segment.is_curve) {
            segment.speed_limit = segment.speed_limit || parseInt(document.getElementById('speedLimit').value);
        }
        
        // Recalculate spaces to next curve for all segments since curve status changed
        this.calculateSpacesToNextCurve();
        
        this.updateSegmentVisual(segmentId, segment);
        
        // Re-render the track to update all segment displays
        this.renderTrack(true); // preserve view
        
        // Save session after curve changes
        this.saveSession();
        
        this.showStatus(`Segment ${segmentId} ${segment.is_curve ? 'marked as curve' : 'unmarked as curve'}`, 'success');
    }

    handleKerbAreaSelection(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const clickedSide = element.getAttribute('data-kerb-side');
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        // Toggle kerb on the clicked side
        if (!segment.has_kerb) {
            // No kerbs yet, add kerb to clicked side
            segment.has_kerb = true;
            segment.kerb_side = clickedSide;
            this.showStatus(`Segment ${segmentId} kerb added (${clickedSide} side)`, 'success');
        } else {
            // Already has kerbs, check current configuration
            if (segment.kerb_side === clickedSide) {
                // Clicking the same side that already has kerbs - remove them
                segment.has_kerb = false;
                segment.kerb_side = 'both';
                this.showStatus(`Segment ${segmentId} kerb removed`, 'success');
            } else if (segment.kerb_side === 'both') {
                // Has kerbs on both sides, switch to only the clicked side
                segment.kerb_side = clickedSide;
                this.showStatus(`Segment ${segmentId} kerb: ${clickedSide} side only`, 'success');
            } else {
                // Has kerbs on opposite side, add to both sides
                segment.kerb_side = 'both';
                this.showStatus(`Segment ${segmentId} kerbs: both sides`, 'success');
            }
        }
        
        this.renderTrack(true); // Preserve view when toggling kerb
        
        // Save session after kerb changes
        this.saveSession();
    }

    handleNumberSideToggle(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        // Find which curve this number is pointing to
        const targetCurveSegment = this.findTargetCurveForSegment(segment);
        if (!targetCurveSegment) {
            this.showStatus(`No target curve found for segment ${segmentId}`, 'warning');
            return;
        }
        
        // Toggle the side for this curve
        const newSide = (segment.number_side === 'left') ? 'right' : 'left';
        
        // Update ALL segments that point to the same target curve
        let updatedCount = 0;
        this.trackData.segments.forEach(seg => {
            const segTargetCurve = this.findTargetCurveForSegment(seg);
            if (segTargetCurve && segTargetCurve.segment_number === targetCurveSegment.segment_number) {
                seg.number_side = newSide;
                updatedCount++;
            }
        });
        
        // Re-render the track to update number positions
        this.renderTrack(true); // preserve view
        
        // Save session after changes
        this.saveSession();
        
        this.showStatus(`${updatedCount} numbers pointing to curve ${targetCurveSegment.segment_number} moved to ${newSide} side`, 'success');
    }
    
    // Find which curve segment this segment is pointing to
    findTargetCurveForSegment(segment) {
        if (!segment.targetCurveId) return null;
        
        return this.trackData.segments.find(s => s.segment_number === segment.targetCurveId);
    }

    handleKerbSelection(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        if (!segment.has_kerb) {
            // First click: enable kerbs on both sides
            segment.has_kerb = true;
            segment.kerb_side = 'both';
            this.showStatus(`Segment ${segmentId} kerbs added (both sides)`, 'success');
        } else {
            // Cycle through kerb options: both -> left -> right -> off
            switch (segment.kerb_side) {
                case 'both':
                    segment.kerb_side = 'left';
                    this.showStatus(`Segment ${segmentId} kerbs: left side only`, 'success');
                    break;
                case 'left':
                    segment.kerb_side = 'right';
                    this.showStatus(`Segment ${segmentId} kerbs: right side only`, 'success');
                    break;
                case 'right':
                    segment.has_kerb = false;
                    segment.kerb_side = 'both';
                    this.showStatus(`Segment ${segmentId} kerbs removed`, 'success');
                    break;
                default:
                    segment.has_kerb = false;
                    segment.kerb_side = 'both';
                    this.showStatus(`Segment ${segmentId} kerbs removed`, 'success');
                    break;
            }
        }
        
        this.renderTrack(true); // Preserve view when toggling kerb
        
        // Save session after kerb changes
        this.saveSession();
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
                const lineCoords = this.calculateSegmentLineCoordinates(segment);
                if (lineCoords) {
                    if (!speedText) {
                        speedText = this.createSpeedLimitText(segment, lineCoords.center_point, trackGroup);
                    } else {
                        speedText.setAttribute('font-size', this.visualSettings.speedLimitSize);
                        speedText.setAttribute('x', lineCoords.center_point[0] + 20);
                        speedText.setAttribute('y', lineCoords.center_point[1]);
                        speedText.textContent = segment.speed_limit;
                    }
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
        previewCircle.setAttribute('stroke', 'black');
        previewCircle.setAttribute('stroke-width', '2');
        previewCircle.setAttribute('opacity', '0.5');
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
        
        // Update the moved segment's position
        segment.distance = newDistance;
        segment.centerline_index = centerlineIndex;
        segment.interpolation_t = 0; // Position exactly on centerline point
        
        // The new segment fill calculation will automatically handle how this affects
        // the boundaries of adjacent segments when the track is re-rendered
        
        // Re-render the track to update segment fills based on new positions
        this.renderTrack(true); // Preserve view when moving segments
        
        // Save session after segment movement
        this.saveSession();
        
        this.showStatus(`Segment ${segmentId} moved - adjacent segments updated`, 'success');
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

    // White line methods (similar to kerb methods but for solid white lines)
    handleWhiteLineAreaSelection(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const side = element.getAttribute('data-side');
        
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        // Initialize white line properties if they don't exist
        if (!segment.has_white_line) {
            segment.has_white_line = false;
            segment.white_line_side = 'left'; // Default to left, but will be set by clicked side
        }
        
        if (!segment.has_white_line) {
            // First click: enable white line on the clicked side
            segment.has_white_line = true;
            segment.white_line_side = side;
            this.showStatus(`Segment ${segmentId} white line added (${side} side)`, 'success');
        } else {
            // If clicking the same side, remove white line
            if (segment.white_line_side === side) {
                // Remove white line completely
                segment.has_white_line = false;
                this.showStatus(`Segment ${segmentId} white line removed`, 'success');
            } else {
                // Clicking the opposite side, switch to that side
                segment.white_line_side = side;
                this.showStatus(`Segment ${segmentId} white line switched to ${side} side`, 'success');
            }
        }
        
        this.renderTrack(true); // Preserve view when toggling white lines
        
        // Save session after white line changes
        this.saveSession();
    }

    handleWhiteLineSelection(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        // Initialize white line properties if they don't exist
        if (!segment.has_white_line) {
            segment.has_white_line = false;
            segment.white_line_side = 'left'; // Default to left
        }
        
        if (!segment.has_white_line) {
            // First click: enable white lines on left side (default)
            segment.has_white_line = true;
            segment.white_line_side = 'left';
            this.showStatus(`Segment ${segmentId} white line added (left side)`, 'success');
        } else {
            // Cycle through white line options: left -> right -> off
            switch (segment.white_line_side) {
                case 'left':
                    segment.white_line_side = 'right';
                    this.showStatus(`Segment ${segmentId} white line: right side`, 'success');
                    break;
                case 'right':
                    segment.has_white_line = false;
                    segment.white_line_side = 'left'; // Reset to default
                    this.showStatus(`Segment ${segmentId} white line removed`, 'success');
                    break;
                default:
                    segment.has_white_line = false;
                    segment.white_line_side = 'left'; // Reset to default
                    this.showStatus(`Segment ${segmentId} white line removed`, 'success');
                    break;
            }
        }
        
        this.renderTrack(true); // Preserve view when toggling white lines
        
        // Save session after white line changes
        this.saveSession();
    }

    createWhiteLineHitAreas(segment, group) {
        // Only create white line hit areas in white line mode
        if (this.currentMode !== 'whiteLine') return;
        
        const segmentProgress = segment.distance || 0;
        const totalLength = this.calculateTrackLength();
        
        // Calculate actual segment length based on next segment position
        const currentSegmentIndex = this.trackData.segments.findIndex(s => s.segment_number === segment.segment_number);
        const nextSegment = this.trackData.segments[currentSegmentIndex + 1];
        
        let segmentLength;
        if (nextSegment) {
            // Use distance to next segment
            segmentLength = (nextSegment.distance || 0) - segmentProgress;
        } else {
            // For the last segment, use the default segment length
            segmentLength = this.trackData.segment_length || 400;
        }
        
        // Ensure positive segment length
        segmentLength = Math.max(segmentLength, 10); // Minimum 10 units
        
        const startRatio = segmentProgress / totalLength;
        const endRatio = Math.min((segmentProgress + segmentLength) / totalLength, 1);
        
        const trackBorderDistance = (this.trackData.track_width / 2);
        const whiteLineDistance = trackBorderDistance + (this.visualSettings.whiteLineWidth / 2)
        
        // Create hit areas at the white line positions
        const centerlineSegment = this.trackData.centerline.slice(
            Math.floor(startRatio * (this.trackData.centerline.length - 1)),
            Math.ceil(endRatio * (this.trackData.centerline.length - 1)) + 1
        );
        
        // Create clickable areas along the track borders
        const leftBorderSegment = this.createParallelLine(centerlineSegment, trackBorderDistance, 'left');
        const rightBorderSegment = this.createParallelLine(centerlineSegment, trackBorderDistance, 'right');
        
        if (leftBorderSegment.length > 1) {
            const leftHitArea = this.createPathFromPoints(leftBorderSegment);
            leftHitArea.setAttribute('stroke', 'transparent');
            leftHitArea.setAttribute('stroke-width', '60');
            leftHitArea.setAttribute('fill', 'none');
            leftHitArea.setAttribute('opacity', '0');
            leftHitArea.setAttribute('class', 'white-line-hit-area');
            leftHitArea.setAttribute('data-segment-id', segment.segment_number);
            leftHitArea.setAttribute('data-side', 'left');
            leftHitArea.style.cursor = 'pointer';
            group.appendChild(leftHitArea);
        }
        
        if (rightBorderSegment.length > 1) {
            const rightHitArea = this.createPathFromPoints(rightBorderSegment);
            rightHitArea.setAttribute('stroke', 'transparent');
            rightHitArea.setAttribute('stroke-width', '60');
            rightHitArea.setAttribute('fill', 'none');
            rightHitArea.setAttribute('opacity', '0');
            rightHitArea.setAttribute('class', 'white-line-hit-area');
            rightHitArea.setAttribute('data-segment-id', segment.segment_number);
            rightHitArea.setAttribute('data-side', 'right');
            rightHitArea.style.cursor = 'pointer';
            group.appendChild(rightHitArea);
        }
    }

    renderWhiteLines(group) {
        // Group contiguous white line segments and render them as unified white lines
        const whiteLineSegments = this.trackData.segments.filter(s => s.has_white_line);
        const contiguousGroups = this.groupContiguousWhiteLineSegments(whiteLineSegments);
        
        contiguousGroups.forEach(whiteLineGroup => {
            this.createUnifiedWhiteLineForGroup(whiteLineGroup, group);
        });
    }

    groupContiguousWhiteLineSegments(whiteLineSegments) {
        if (whiteLineSegments.length === 0) return [];
        
        // Sort segments by their segment number (not distance) for white lines
        const sortedSegments = [...whiteLineSegments].sort((a, b) => a.segment_number - b.segment_number);
        
        const groups = [];
        let currentGroup = {
            segments: [sortedSegments[0]],
            sides: new Set([sortedSegments[0].white_line_side])
        };
        
        for (let i = 1; i < sortedSegments.length; i++) {
            const currentSegment = sortedSegments[i];
            const previousSegment = currentGroup.segments[currentGroup.segments.length - 1];
            
            // For white lines, only group if segments are consecutive by number AND same side
            const isConsecutive = (currentSegment.segment_number === previousSegment.segment_number + 1);
            const sameSide = (previousSegment.white_line_side === currentSegment.white_line_side);
            
            if (isConsecutive && sameSide) {
                // Add to current group
                currentGroup.segments.push(currentSegment);
                currentGroup.sides.add(currentSegment.white_line_side);
            } else {
                // Start a new group
                groups.push(currentGroup);
                currentGroup = {
                    segments: [currentSegment],
                    sides: new Set([currentSegment.white_line_side])
                };
            }
        }
        
        // Add the last group
        groups.push(currentGroup);
        
        return groups;
    }

    doWhiteLineSidesOverlap(side1, side2) {
        // White lines can only be on one side, so they only overlap if they're the same side
        return side1 === side2;
    }

    createUnifiedWhiteLineForGroup(whiteLineGroup, group) {
        // Calculate the combined boundaries of all segments in the group
        const segments = whiteLineGroup.segments;
        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];
        
        // Calculate the start and end positions
        const startDistance = firstSegment.distance || 0;
        
        // For end distance, calculate the actual end of the last segment
        const lastSegmentIndex = this.trackData.segments.findIndex(s => s.segment_number === lastSegment.segment_number);
        const nextSegment = this.trackData.segments[lastSegmentIndex + 1];
        
        let endDistance;
        if (nextSegment) {
            endDistance = nextSegment.distance || 0;
        } else {
            // For the last segment, use the total track length instead of adding segment length
            const totalLength = this.calculateTrackLength();
            endDistance = totalLength;
        }
        
        const totalLength = this.calculateTrackLength();
        const startRatio = startDistance / totalLength;
        const endRatio = Math.min(endDistance / totalLength, 1);
        
        // Determine which side to render (should be consistent across the group)
        const side = firstSegment.white_line_side;
        
        // Calculate white line distance: start at track border and extend outward
        const trackBorderDistance = (this.trackData.track_width / 2);
        const whiteLineDistance = trackBorderDistance + (this.visualSettings.whiteLineWidth / 2)
        
        // Create unified white line path for the single side
        const groupId = `white-line-group-${firstSegment.segment_number}-${lastSegment.segment_number}`;
        this.createUnifiedWhiteLinePath(startRatio, endRatio, side, whiteLineDistance, group, groupId);
    }

    createUnifiedWhiteLinePath(startRatio, endRatio, side, whiteLineDistance, group, groupId) {
        // Get the centerline segment for the unified white line
        const centerlineStartIndex = Math.floor(startRatio * (this.trackData.centerline.length - 1));
        const centerlineEndIndex = Math.ceil(endRatio * (this.trackData.centerline.length - 1));
        
        const centerlineSegment = this.trackData.centerline.slice(centerlineStartIndex, centerlineEndIndex + 1);
        
        if (centerlineSegment.length < 2) return;
        
        // Create white line path at the specified distance from centerline
        const whiteLinePoints = this.createParallelLine(centerlineSegment, whiteLineDistance, side);
        
        if (whiteLinePoints.length > 1) {
            const whiteLinePath = this.createPathFromPoints(whiteLinePoints);
            whiteLinePath.setAttribute('stroke', 'white');
            whiteLinePath.setAttribute('stroke-width', this.visualSettings.whiteLineWidth);
            whiteLinePath.setAttribute('fill', 'none');
            whiteLinePath.setAttribute('id', `${groupId}-${side}`);
            whiteLinePath.setAttribute('class', 'white-line');
            group.appendChild(whiteLinePath);
        }
    }

    createKerbForSegment(segment, group) {
        // Create red and white striped kerbs on track borders for this segment
        const segmentProgress = segment.distance || 0;
        const totalLength = this.calculateTrackLength();
        
        // Calculate actual segment length based on next segment position
        const currentSegmentIndex = this.trackData.segments.findIndex(s => s.segment_number === segment.segment_number);
        const nextSegment = this.trackData.segments[currentSegmentIndex + 1];
        
        let segmentLength;
        if (nextSegment) {
            // Use distance to next segment
            segmentLength = (nextSegment.distance || 0) - segmentProgress;
        } else {
            // Last segment: use remaining track length or default segment length
            const remainingLength = totalLength - segmentProgress;
            segmentLength = Math.min(remainingLength, this.trackData.segment_length || 400);
        }
        
        // Ensure positive segment length
        segmentLength = Math.max(segmentLength, 10); // Minimum 10 units
        
        // Calculate border distance for white track borders
        const borderDistance = (this.trackData.track_width / 2) * this.visualSettings.borderOffset;
        
        // Create kerb paths that start at the white border and extend outward
        if (segment.kerb_side === 'left' || segment.kerb_side === 'both') {
            this.createKerbPathAtBorder(segment, 'left', borderDistance, group);
        }
        if (segment.kerb_side === 'right' || segment.kerb_side === 'both') {
            this.createKerbPathAtBorder(segment, 'right', borderDistance, group);
        }
    }

    createKerbPathAtBorder(segment, side, borderDistance, group) {
        const segmentProgress = segment.distance || 0;
        const totalLength = this.calculateTrackLength();
        
        // Calculate actual segment length based on next segment position
        const currentSegmentIndex = this.trackData.segments.findIndex(s => s.segment_number === segment.segment_number);
        const nextSegment = this.trackData.segments[currentSegmentIndex + 1];
        
        let segmentLength;
        if (nextSegment) {
            // Use distance to next segment
            segmentLength = (nextSegment.distance || 0) - segmentProgress;
        } else {
            // Last segment: use remaining track length or default segment length
            const remainingLength = totalLength - segmentProgress;
            segmentLength = Math.min(remainingLength, this.trackData.segment_length || 400);
        }
        
        // Ensure positive segment length
        segmentLength = Math.max(segmentLength, 10); // Minimum 10 units
        
        const startRatio = segmentProgress / totalLength;
        const endRatio = Math.min((segmentProgress + segmentLength) / totalLength, 1);
        
        // Calculate the kerb offset: position kerb so its inner edge aligns with the outer edge of the white border
        // Account for the border line stroke width
        const borderStrokeWidth = this.visualSettings.borderWidth || 2;
        const kerbOffset = borderDistance - (borderStrokeWidth / 2) + (this.visualSettings.kerbWidth / 2);
        
        // Create kerb path at the correct distance from centerline
        const kerbPoints = this.createParallelLine(this.trackData.centerline.slice(
            Math.floor(startRatio * (this.trackData.centerline.length - 1)),
            Math.ceil(endRatio * (this.trackData.centerline.length - 1)) + 1
        ), kerbOffset, side);
        
        if (kerbPoints.length > 1) {
            this.createKerbPath(kerbPoints, `${side}-kerb-${segment.segment_number}`, group);
        }
    }

    getTrackBorderSegment(borderPoints, startRatio, endRatio) {
        const startIndex = Math.floor(startRatio * (borderPoints.length - 1));
        const endIndex = Math.floor(endRatio * (borderPoints.length - 1));
        return borderPoints.slice(startIndex, endIndex + 1);
    }

    createKerbPath(points, id, group) {
        if (points.length < 2) return;
        
        const pathData = points.map((point, index) => 
            `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`
        ).join(' ');
        
        // Create base white kerb stripe
        const whiteKerbPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        whiteKerbPath.setAttribute('d', pathData);
        whiteKerbPath.setAttribute('stroke', 'white');
        whiteKerbPath.setAttribute('stroke-width', this.visualSettings.kerbWidth);
        whiteKerbPath.setAttribute('fill', 'none');
        whiteKerbPath.style.pointerEvents = 'none';
        group.appendChild(whiteKerbPath);
        
        // Create red striped pattern on top
        const redKerbPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        redKerbPath.setAttribute('d', pathData);
        redKerbPath.setAttribute('stroke', '#9f1717ff');
        redKerbPath.setAttribute('stroke-width', this.visualSettings.kerbWidth);
        redKerbPath.setAttribute('stroke-dasharray', `${this.visualSettings.kerbDashLength} ${this.visualSettings.kerbGapLength}`);
        redKerbPath.setAttribute('fill', 'none');
        redKerbPath.style.pointerEvents = 'none';
        group.appendChild(redKerbPath);
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

    // Session persistence methods
    debouncedSaveSession() {
        // Clear existing timeout
        if (this.saveSessionTimeout) {
            clearTimeout(this.saveSessionTimeout);
        }
        
        // Set new timeout to save after 1 second of inactivity
        this.saveSessionTimeout = setTimeout(() => {
            this.saveSession();
        }, 1000);
    }

    saveSession() {
        try {
            const sessionData = {
                centerlinePoints: this.centerlinePoints,
                trackData: this.trackData,
                viewState: {
                    scale: this.scale,
                    panX: this.panX,
                    panY: this.panY
                },
                currentMode: this.currentMode,
                timestamp: Date.now()
            };
            
            localStorage.setItem('heatTrackSession', JSON.stringify(sessionData));
        } catch (error) {
            console.warn('Failed to save session:', error);
        }
    }

    restoreSession() {
        try {
            const savedSession = localStorage.getItem('heatTrackSession');
            if (!savedSession) return;
            
            const sessionData = JSON.parse(savedSession);
            
            // Check if session is recent (within 7 days)
            const daysSinceLastSession = (Date.now() - sessionData.timestamp) / (1000 * 60 * 60 * 24);
            if (daysSinceLastSession > 7) {
                localStorage.removeItem('heatTrackSession');
                return;
            }
            
            // Restore centerline points
            if (sessionData.centerlinePoints && sessionData.centerlinePoints.length > 0) {
                this.centerlinePoints = sessionData.centerlinePoints;
                this.showCenterlinePreview();
            }
            
            // Restore track data
            if (sessionData.trackData) {
                this.trackData = sessionData.trackData;
                this.renderTrack();
                
                // Restore view state after track is rendered
                if (sessionData.viewState) {
                    this.scale = sessionData.viewState.scale || 1;
                    this.panX = sessionData.viewState.panX || 0;
                    this.panY = sessionData.viewState.panY || 0;
                    
                    // Apply the restored view transform
                    const svg = document.getElementById('trackCanvas');
                    const trackGroup = svg.querySelector('#trackGroup');
                    if (trackGroup) {
                        trackGroup.setAttribute('transform', 
                            `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
                    }
                }
            }
            
            // Restore mode
            if (sessionData.currentMode) {
                this.setMode(sessionData.currentMode);
            }
            
            this.showStatus('Session restored from previous visit!', 'success');
            
        } catch (error) {
            console.warn('Failed to restore session:', error);
            localStorage.removeItem('heatTrackSession');
        }
    }

    clearSession() {
        localStorage.removeItem('heatTrackSession');
        this.showStatus('Session cleared', 'success');
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
