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
        this.viewBoxWidth = 1400;
        this.viewBoxHeight = 800;
        
        // Default visual settings
        this.defaultSettings = {
            segmentNumberSize: 38,
            segmentNumberOffset: 140, // Distance to offset numbers from centerline
            distanceSignSize: 60, // Size of the distance sign image
            speedLimitSize: 64,
            speedLimitOffset: 230, // Distance to offset speed limits from centerline
            normalSegmentWidth: 8,
            curveSegmentWidth: 25,
            borderWidth: 5,
            borderOffset: 0.9,
            centerlineWidth: 5,
            dashLength: 20,
            gapLength: 20,
            kerbWidth: 12,
            kerbDashLength: 15,
            kerbGapLength: 10,
            whiteLineWidth: 12,
            // Color settings
            trackFillColor: '#000000',
            trackBorderColor: '#ffffff',
            centerlineColor: '#ffffff',
            whiteLineColor: '#ffffff',
            previewCenterlineColor: '#fb0000',
            segmentNumberColor: '#ffffff',
            speedLimitColor: '#ffff00',
            kerbWhiteColor: '#ffffff',
            kerbRedColor: '#9f1717',
        };

        // Load saved settings or use defaults
        this.visualSettings = this.loadVisualSettings();

        // Image cache for base64 data URIs
        this.imageCache = {};

        this.initializeEventListeners();
        this.setupSVGInteraction();
        this.setMode(this.currentMode);

        // Restore the previous session once the sign images are embedded, so the
        // first render (and any immediate export) already uses the data URIs
        this.loadImagesAsDataURI().then(() => this.restoreSession());
    }

    initializeEventListeners() {
        // File upload
        const fileUpload = document.getElementById('fileUpload');
        const fileInput = document.getElementById('fileInput');
        
        fileUpload.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        
        // SVGs can be dropped on the upload box or anywhere on the canvas
        [fileUpload, document.getElementById('canvasArea')].forEach(dropTarget => {
            dropTarget.addEventListener('dragover', this.handleDragOver.bind(this));
            dropTarget.addEventListener('dragleave', this.handleDragLeave.bind(this));
            dropTarget.addEventListener('drop', this.handleDrop.bind(this));
        });
        
        // Example tracks
        document.querySelectorAll('[data-example]').forEach(button => {
            button.addEventListener('click', () => this.loadExampleTrack(button.dataset.example));
        });
        
        document.getElementById('fitView').addEventListener('click', () => this.fitView());

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
        
        // Save/Load track buttons
        document.getElementById('saveTrack').addEventListener('click', (e) => {
            e.preventDefault(); // Prevent any default behavior
            this.saveTrackToFile();
        });
        document.getElementById('loadTrack').addEventListener('click', (e) => {
            e.preventDefault(); // Prevent any default behavior
            document.getElementById('trackFileInput').click();
        });
        document.getElementById('trackFileInput').addEventListener('change', (e) => this.loadTrackFromFile(e));

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
        document.getElementById('speedLimitOffset').addEventListener('change', this.onVisualSettingChange.bind(this));
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
        
        // Color settings listeners
        document.getElementById('trackFillColor').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('trackBorderColor').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('centerlineColor').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('whiteLineColor').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('segmentNumberColor').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('kerbWhiteColor').addEventListener('change', this.onVisualSettingChange.bind(this));
        document.getElementById('kerbRedColor').addEventListener('change', this.onVisualSettingChange.bind(this));
        
        // Settings buttons
        document.getElementById('saveSettings').addEventListener('click', this.saveVisualSettings.bind(this));
        document.getElementById('loadSettings').addEventListener('click', this.loadAndApplySettings.bind(this));
        document.getElementById('resetSettings').addEventListener('click', this.resetToDefaultSettings.bind(this));
    }

    // Load images as base64 data URIs for SVG export compatibility
    async loadImagesAsDataURI() {
        const imagePaths = ['assets/speed_limit_sign.png', 'assets/distance_sign.png'];

        await Promise.all(imagePaths.map(async imagePath => {
            try {
                const response = await fetch(imagePath);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                this.imageCache[imagePath] = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                // Happens when index.html is opened from disk (file://); exports will lack the sign images
                console.warn(`Failed to load image ${imagePath}:`, error);
                this.imageCache[imagePath] = imagePath;
            }
        }));
    }

    setupSVGInteraction() {
        const svg = document.getElementById('trackCanvas');

        // Pointer events cover mouse, touch and pen; pointercancel ends a drag cleanly
        svg.addEventListener('pointerdown', this.handleMouseDown.bind(this));
        svg.addEventListener('pointermove', this.handleMouseMove.bind(this));
        svg.addEventListener('pointerup', this.handleMouseUp.bind(this));
        svg.addEventListener('pointercancel', this.handleMouseUp.bind(this));
        svg.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    }

    // Convert a pointer event's client position to viewBox coordinates
    // (accounts for the canvas being letterboxed by preserveAspectRatio)
    clientToViewBox(e) {
        const svg = document.getElementById('trackCanvas');
        const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
        return { x: point.x, y: point.y };
    }

    // Convert viewBox coordinates to track coordinates (undo the pan/zoom transform)
    viewBoxToTrack(x, y) {
        return { x: (x - this.panX) / this.scale, y: (y - this.panY) / this.scale };
    }

    applyViewTransform() {
        const trackGroup = document.querySelector('#trackCanvas #trackGroup');
        if (trackGroup) {
            trackGroup.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
        }
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel && this.fitScale) {
            zoomLevel.textContent = `Zoom: ${Math.round(this.scale / this.fitScale * 100)}%`;
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    handleDragLeave(e) {
        // Ignore dragleave events caused by moving over child elements
        if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.classList.remove('dragover');
        }
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

    async loadSVGFile(file, { confirmed = false } = {}) {
        if (!file.name.toLowerCase().endsWith('.svg')) {
            this.showStatus('Please select an SVG file', 'error');
            return;
        }

        if (!confirmed && !this.confirmDiscardEdits('Loading a new SVG')) {
            return;
        }

        try {
            const svgContent = await this.readFileAsText(file);
            this.parseSVGCenterline(svgContent);
            
            document.getElementById('fileName').textContent = `Loaded: ${file.name}`;
            document.getElementById('generateBtn').disabled = false;
            this.showStatus(`File loaded: ${file.name}`, 'success');
        } catch (error) {
            this.showStatus('Error loading SVG: ' + error.message, 'error');
        }
    }

    async loadExampleTrack(url) {
        if (this.trackData && !confirm('Replace the current track with this example?')) return;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const file = new File([await response.blob()], url.split('/').pop(), { type: 'image/svg+xml' });
            // Already confirmed above, so don't ask again while loading
            await this.loadSVGFile(file, { confirmed: true });
            if (this.centerlinePoints && !this.trackData) this.generateTrack();
        } catch (error) {
            this.showStatus('Could not load example: ' + error.message, 'error');
        }
    }

    // Re-center and re-scale the view on the whole track
    fitView() {
        if (this.trackData) {
            this.renderTrack();
        } else if (this.centerlinePoints) {
            this.showCenterlinePreview();
        }
        this.debouncedSaveSession();
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
        const transform = this.getAccumulatedTransform(path);

        // Measure a copy inside the live document: getTotalLength() isn't reliable on
        // elements of a parsed, unrendered document in every browser
        const measureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        measureSvg.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
        const livePath = document.importNode(path, true);
        livePath.removeAttribute('transform');
        measureSvg.appendChild(livePath);
        document.body.appendChild(measureSvg);

        // Sample points along the path
        const points = [];
        const numSamples = 1000; // TODO: Configurable parameter

        try {
            const pathLength = livePath.getTotalLength();
            for (let i = 0; i <= numSamples; i++) {
                const distance = (i / numSamples) * pathLength;
                const { x, y } = livePath.getPointAtLength(distance);
                const point = new DOMPoint(x, y).matrixTransform(transform);
                points.push([point.x, point.y]);
            }
        } finally {
            measureSvg.remove();
        }

        this.centerlinePoints = points;
        // A new centerline invalidates any previously generated track
        this.trackData = null;
        console.log(`Extracted ${points.length} centerline points`);

        // Show preview of the loaded centerline
        this.showCenterlinePreview();
        this.saveSession();
    }

    // Combine the transforms of the path and its ancestor groups (up to the root <svg>)
    getAccumulatedTransform(element) {
        let matrix = new DOMMatrix();
        for (let el = element; el && el.localName !== 'svg'; el = el.parentElement) {
            const local = el.transform && el.transform.baseVal.consolidate();
            if (local) matrix = DOMMatrix.fromMatrix(local.matrix).multiply(matrix);
        }
        return matrix;
    }

    showCenterlinePreview() {
        if (!this.centerlinePoints || this.centerlinePoints.length === 0) return;

        const svg = document.getElementById('trackCanvas');
        
        // Clear existing content
        const existingTrack = svg.querySelector('#trackGroup');
        if (existingTrack) existingTrack.remove();
        

        // Create preview group
        const previewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        previewGroup.id = 'trackGroup';
        
        // Auto-scale and center the preview
        this.autoScaleAndCenterPreview(previewGroup);

        // Create centerline path for preview
        const centerPath = this.createPathFromPoints(this.centerlinePoints);
        centerPath.setAttribute('stroke', this.visualSettings.previewCenterlineColor); // Color for preview
        centerPath.setAttribute('stroke-width', '25');
        centerPath.setAttribute('fill', 'none');
        previewGroup.appendChild(centerPath);

        svg.appendChild(previewGroup);
    }

    autoScaleAndCenterPreview(previewGroup) {
        this.fitToBounds(this.calculatePointBounds(this.centerlinePoints), previewGroup);
    }

    calculatePointBounds(points) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [x, y] of points) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        return { minX, maxX, minY, maxY };
    }

    // Scale and center the given bounds inside the viewBox
    fitToBounds(bounds, group) {
        const scaleX = this.viewBoxWidth / (bounds.maxX - bounds.minX + 100);
        const scaleY = this.viewBoxHeight / (bounds.maxY - bounds.minY + 100);
        this.scale = Math.min(scaleX, scaleY, 2);
        this.fitScale = this.scale;

        this.panX = (this.viewBoxWidth - (bounds.maxX - bounds.minX) * this.scale) / 2 - bounds.minX * this.scale;
        this.panY = (this.viewBoxHeight - (bounds.maxY - bounds.minY) * this.scale) / 2 - bounds.minY * this.scale;

        group.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
        this.applyViewTransform();
    }

    // Returns true if a track was generated, false if there was nothing to do or the user cancelled
    generateTrack() {
        if (!this.centerlinePoints) {
            this.showStatus('Please load an SVG file first', 'error');
            return false;
        }
        
        if (!this.confirmDiscardEdits('Regenerating the track')) {
            return false;
        }

        const trackWidth = parseFloat(document.getElementById('trackWidth').value);
        const segmentLength = parseFloat(document.getElementById('segmentLength').value);

        this.showLoading(true);
        let generated = false;

        try {
            // Generate track borders
            this.generateTrackBorders(trackWidth);
            
            // Divide track into segments
            this.divideTrackIntoSegments(segmentLength);
            
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
            generated = true;
        } catch (error) {
            this.showStatus('Generation failed: ' + error.message, 'error');
        }

        this.showLoading(false);
        return generated;
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

    divideTrackIntoSegments(segmentLength) {
        // A track whose ends are closer than this (as a ratio of segment length) is treated as a closed loop
        const CLOSED_TRACK_DISTANCE_RATIO = 0.5;
        
        // Input validation
        if (!this.centerlinePoints || this.centerlinePoints.length < 2) {
            throw new Error('Invalid centerline points: Need at least 2 points');
        }
        
        if (!(segmentLength > 0)) {
            throw new Error('Segment length must be positive');
        }
        
        const totalLength = this.calculateTrackLength();
        
        // Check if track is long enough for segments
        if (totalLength < segmentLength) {
            console.warn(`Track length (${totalLength.toFixed(2)}) is shorter than segment length (${segmentLength})`);
            this.segmentDivisions = [];
            return;
        }
        
        const first = this.centerlinePoints[0];
        const last = this.centerlinePoints[this.centerlinePoints.length - 1];
        const isClosed = Math.hypot(last[0] - first[0], last[1] - first[1]) < segmentLength * CLOSED_TRACK_DISTANCE_RATIO;
        
        // On a closed loop, stretch the spacing slightly so every space has the same length;
        // on an open track keep the exact length and let the last space take the remainder
        let segmentCount, spacing;
        if (isClosed) {
            segmentCount = Math.max(1, Math.round(totalLength / segmentLength));
            spacing = totalLength / segmentCount;
        } else {
            segmentCount = Math.floor(totalLength / segmentLength) + 1;
            spacing = segmentLength;
        }
        
        console.log(`Track length: ${totalLength.toFixed(2)} units (${isClosed ? 'closed' : 'open'})`);
        console.log(`Creating ${segmentCount} segments of ${spacing.toFixed(2)} units each`);
        
        const segmentDivisions = [];
        for (let i = 0; i < segmentCount; i++) {
            const distance = Math.min(i * spacing, totalLength);
            const { index, t } = this.locateDistance(distance);
            
            segmentDivisions.push({
                segment_number: i + 1,
                centerline_index: index,
                interpolation_t: t,
                distance: distance,
                is_curve: false,
                speed_limit: 0,
                has_kerb: false,
                kerb_side: 'left', // 'left', 'right', or 'both'
                has_white_line: true,
                white_line_side: 'right', // 'left' or 'right'
                number_side: 'left', // 'left' or 'right' - which side to show numbers
                speed_limit_side: 'left', // 'left' or 'right' - which side to show speed limits
                targetCurveId: null // Will be set by calculateSpacesToNextCurve
            });
        }
        
        this.segmentDivisions = segmentDivisions;
        console.log(`Created ${segmentDivisions.length} segment divisions`);
    }

    // Cumulative distance along the centerline at each point (cached per centerline array)
    getCumulativeDistances() {
        const points = this.centerlinePoints;
        if (!points) return [0];
        if (this.distanceCache && this.distanceCache.points === points) {
            return this.distanceCache.distances;
        }
        
        const distances = [0];
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            distances.push(distances[i - 1] + Math.hypot(curr[0] - prev[0], curr[1] - prev[1]));
        }
        this.distanceCache = { points, distances };
        return distances;
    }

    // Find the centerline segment index and interpolation factor for a distance along the track
    locateDistance(distance) {
        const distances = this.getCumulativeDistances();
        let low = 0;
        let high = distances.length - 2;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (distances[mid] <= distance) low = mid;
            else high = mid - 1;
        }
        const span = distances[low + 1] - distances[low];
        const t = span > 0 ? Math.min(Math.max((distance - distances[low]) / span, 0), 1) : 0;
        return { index: low, t };
    }

    // Distance where a segment ends: the next segment's line, or the end of the track for the last one
    getSegmentEndDistance(segment) {
        const segments = this.trackData.segments;
        const index = segments.indexOf(segment);
        return index >= 0 && index < segments.length - 1 ? segments[index + 1].distance : this.calculateTrackLength();
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
        
        // Second pass: group segments by target curve and assign consistent number_side and white_line_side
        this.groupPropertiesByTargetCurve();
    }
    
    // Group segments that point to the same curve and assign consistent number_side and white_line_side
    groupPropertiesByTargetCurve() {
        if (!this.segmentDivisions) return;
        
        // Get all unique target curves
        const targetCurves = [...new Set(this.segmentDivisions
            .filter(s => s.targetCurveId !== null)
            .map(s => s.targetCurveId))];
        
        // For each target curve, ensure all segments pointing to it have consistent properties
        targetCurves.forEach(curveId => {
            const segmentsPointingToCurve = this.segmentDivisions.filter(s => s.targetCurveId === curveId);
            
            if (segmentsPointingToCurve.length > 0) {
                // Use the number_side of the first segment (or default to 'left' if not set)
                const consistentNumberSide = segmentsPointingToCurve[0].number_side || 'left';
                
                // Use the white_line_side of the first segment (or default to 'right' if not set)
                const consistentWhiteLineSide = segmentsPointingToCurve[0].white_line_side || 'right';
                
                // Apply consistent properties to all segments pointing to this curve
                segmentsPointingToCurve.forEach(segment => {
                    segment.number_side = consistentNumberSide;
                    segment.white_line_side = consistentWhiteLineSide;
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
        

        // Create main group
        const trackGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        trackGroup.id = 'trackGroup';
        // Set explicitly so exported files don't fall back to a serif font
        trackGroup.setAttribute('font-family', "Inter, 'Segoe UI', Arial, sans-serif");

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
        this.fitToBounds(this.calculatePointBounds([
            ...this.trackData.left_border,
            ...this.trackData.right_border
        ]), trackGroup);
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
            segmentFill.setAttribute('fill', this.visualSettings.trackFillColor);
            segmentFill.setAttribute('stroke', 'none');
            segmentFill.setAttribute('class', 'segment-fill');
            segmentFill.setAttribute('data-segment-id', segment.segment_number);
            segmentFill.style.cursor = this.getCursorForMode();
            segmentFill.style.pointerEvents = 'auto';
            
            group.appendChild(segmentFill);
        });
    }

    createSegmentFillPath(segment) {
        // A segment's space runs from its own line to the next segment's line
        const segments = this.trackData.segments;
        const totalLength = this.calculateTrackLength();
        let pathData = this.createTrackStripPath(
            (segment.distance || 0) / totalLength,
            this.getSegmentEndDistance(segment) / totalLength
        );

        // The last space also covers the stretch before the first line (wraps around on closed tracks)
        if (segment === segments[segments.length - 1] && segments[0].distance > 0) {
            const wrapPath = this.createTrackStripPath(0, segments[0].distance / totalLength);
            if (wrapPath) pathData = pathData ? `${pathData} ${wrapPath}` : wrapPath;
        }

        return pathData;
    }

    // Closed polygon of the track surface between two positions (as ratios of track length)
    createTrackStripPath(startRatio, endRatio) {
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
        leftPath.setAttribute('stroke', this.visualSettings.trackBorderColor);
        leftPath.setAttribute('stroke-width', this.visualSettings.borderWidth);
        leftPath.setAttribute('fill', 'none');
        group.appendChild(leftPath);

        // Right border
        const rightPath = this.createPathFromPoints(rightBorderPoints);
        rightPath.setAttribute('stroke', this.visualSettings.trackBorderColor);
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
        
        // Determine which sides to render based on segment-by-segment analysis
        const sidesToRender = this.calculateKerbSidesToRender(kerbGroup);
        
        // Calculate border distance
        const borderDistance = (this.trackData.track_width / 2) * this.visualSettings.borderOffset;
        
        // Create unified kerb paths for each continuous side
        sidesToRender.forEach(sideInfo => {
            this.createUnifiedKerbPath(sideInfo.startRatio, sideInfo.endRatio, sideInfo.side, borderDistance, group, `${firstSegment.segment_number}-${sideInfo.side}`);
        });
    }

    calculateKerbSidesToRender(kerbGroup) {
        const segments = kerbGroup.segments;
        const totalLength = this.calculateTrackLength();

        // Track continuous runs of each side
        let leftRuns = [];
        let rightRuns = [];
        let currentLeftRun = null;
        let currentRightRun = null;

        segments.forEach(segment => {
            const segmentSide = kerbGroup.segmentSides.get(segment.segment_number);
            const segmentStartRatio = (segment.distance || 0) / totalLength;
            const segmentEndRatio = this.getSegmentEndDistance(segment) / totalLength;
            
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
        centerPath.setAttribute('stroke', this.visualSettings.centerlineColor);
        centerPath.setAttribute('stroke-width', this.visualSettings.centerlineWidth);
        centerPath.setAttribute('stroke-dasharray', `${this.visualSettings.dashLength} ${this.visualSettings.gapLength}`);
        centerPath.setAttribute('fill', 'none');
        centerPath.setAttribute('opacity', '1');
        group.appendChild(centerPath);
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
        
        return {
            position: offsetPosition,
            direction: centerlineInfo.direction
        };
    }
    
    // Find a point and direction at a specific distance along the centerline
    findPointAndDirectionAtDistance(targetDistance) {
        if (!this.centerlinePoints || this.centerlinePoints.length < 2) return null;

        // Handle wrap-around for closed tracks
        const totalLength = this.calculateTrackLength();
        const normalizedDistance = ((targetDistance % totalLength) + totalLength) % totalLength;

        const { index, t } = this.locateDistance(normalizedDistance);
        const p1 = this.centerlinePoints[index];
        const p2 = this.centerlinePoints[index + 1];
        const direction = this.normalize([p2[0] - p1[0], p2[1] - p1[1]]);

        return {
            point: [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])],
            direction: direction[0] === 0 && direction[1] === 0 ? [1, 0] : direction
        };
    }

    // Calculate the position for speed limits with perpendicular offset from centerline
    calculateSpeedLimitPosition(segment) {
        if (!this.trackData || !this.trackData.segments || !this.centerlinePoints) return null;
        if (!segment.is_curve || !segment.speed_limit) return null;
        
        // For speed limits, position them at the segment's center point
        const segmentDistance = segment.distance || 0;
        
        // Find the point on the centerline at this distance and get direction
        const centerlineInfo = this.findPointAndDirectionAtDistance(segmentDistance);
        if (!centerlineInfo) return null;
        
        // Calculate perpendicular offset
        const offsetDistance = this.visualSettings.speedLimitOffset || 100;
        const perpendicular = [-centerlineInfo.direction[1], centerlineInfo.direction[0]]; // Rotate 90 degrees
        
        // Apply offset based on the segment's speed_limit_side preference
        const sideMultiplier = (segment.speed_limit_side === 'right') ? -1 : 1;
        const offsetPosition = [
            centerlineInfo.point[0] + perpendicular[0] * offsetDistance * sideMultiplier,
            centerlineInfo.point[1] + perpendicular[1] * offsetDistance * sideMultiplier
        ];
        
        return {
            position: offsetPosition,
            direction: centerlineInfo.direction
        };
    }

    createKerbHitAreas(segment, group) {
        // Only create kerb hit areas in kerb mode
        if (this.currentMode !== 'kerb') return;
        
        const totalLength = this.calculateTrackLength();
        const startRatio = (segment.distance || 0) / totalLength;
        const endRatio = Math.min(this.getSegmentEndDistance(segment) / totalLength, 1);

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
            leftPath.setAttribute('stroke-width', '16'); // Clickable width in screen pixels
            leftPath.setAttribute('vector-effect', 'non-scaling-stroke');
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
            rightPath.setAttribute('stroke-width', '16'); // Clickable width in screen pixels
            rightPath.setAttribute('vector-effect', 'non-scaling-stroke');
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
            hitArea.setAttribute('stroke-width', '20');
            hitArea.setAttribute('vector-effect', 'non-scaling-stroke'); // Same click target size at any zoom
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
            const numberInfo = this.calculateSegmentNumberPosition(segment);
            if (!numberInfo) return; // Skip if position calculation failed
            
            // Show only segments with spaces to next curve
            if (segment.spacesToNextCurve !== null && segment.spacesToNextCurve !== undefined) {
                // For numbers 3, 2, 1, 0 - use distance sign image
                if (segment.spacesToNextCurve >= 0 && segment.spacesToNextCurve <= 3) {
                    this.createDistanceSign(segment, numberInfo, group);
                } else {
                    // For numbers 4 and above - use regular text
                    this.createRegularNumber(segment, numberInfo, group);
                }
            }
            
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
        // Calculate the position with offset from centerline
        const speedLimitInfo = this.calculateSpeedLimitPosition(segment);
        if (!speedLimitInfo) return null;
        
        // Calculate rotation angle from direction vector
        const angle = Math.atan2(speedLimitInfo.direction[1], speedLimitInfo.direction[0]) * 180 / Math.PI;
        
        // Create a group for the speed limit sign (image + text)
        const signGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        signGroup.setAttribute('id', `speed-text-${segment.segment_number}`);
        signGroup.setAttribute('class', 'speed-limit-text');
        signGroup.setAttribute('data-segment-id', segment.segment_number);
        signGroup.setAttribute('transform', `translate(${speedLimitInfo.position[0]}, ${speedLimitInfo.position[1]}) rotate(${angle})`);
        signGroup.style.pointerEvents = (this.currentMode === 'edit' || this.currentMode === 'curve') ? 'auto' : 'none';
        signGroup.style.cursor = this.currentMode === 'curve' ? 'pointer' : 'default';
        
        // Calculate size based on visual settings (3x larger for better visibility)
        const signSize = this.visualSettings.speedLimitSize * 3;
        
        // Create the speed limit sign image
        const signImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    signImage.setAttribute('href', this.imageCache['assets/speed_limit_sign.png'] || 'assets/speed_limit_sign.png');
        signImage.setAttribute('x', -signSize / 2);
        signImage.setAttribute('y', -signSize / 2);
        signImage.setAttribute('width', signSize);
        signImage.setAttribute('height', signSize);
        signImage.setAttribute('class', 'speed-limit-sign-image');
        signGroup.appendChild(signImage);
        
        // Create the speed limit text on top of the image
        const speedText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        speedText.setAttribute('x', 0);
        speedText.setAttribute('y', 0);
        speedText.setAttribute('text-anchor', 'middle');
        speedText.setAttribute('dy', '0.1em');
        speedText.setAttribute('dominant-baseline', 'middle');
        speedText.setAttribute('fill', '#000000'); // Black text for visibility on the sign
        speedText.setAttribute('font-size', this.visualSettings.speedLimitSize * 1.8); // Scaled proportionally with the sign
        speedText.setAttribute('font-weight', 'bold');
        speedText.setAttribute('class', 'speed-limit-sign-number');
        speedText.textContent = segment.speed_limit;
        signGroup.appendChild(speedText);
        
        group.appendChild(signGroup);
        return signGroup;
    }

    createDistanceSign(segment, numberInfo, group) {
        // Calculate rotation angle from direction vector
        const angle = Math.atan2(numberInfo.direction[1], numberInfo.direction[0]) * 180 / Math.PI;
        
        // Create a group for the distance sign (image + text)
        const signGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        signGroup.setAttribute('class', `distance-sign ${this.currentMode === 'edit' ? 'draggable' : ''}`);
        signGroup.setAttribute('data-segment-id', segment.segment_number);
        signGroup.setAttribute('transform', `translate(${numberInfo.position[0]}, ${numberInfo.position[1]}) rotate(${angle})`);
        signGroup.style.pointerEvents = (this.currentMode === 'edit' || this.currentMode === 'curve') ? 'auto' : 'none';
        signGroup.style.cursor = this.currentMode === 'edit' ? 'move' : (this.currentMode === 'curve' ? 'pointer' : 'default');
        
        // Calculate size based on visual settings
        const signSize = this.visualSettings.distanceSignSize;
        
        // Create the distance sign image
        const signImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    signImage.setAttribute('href', this.imageCache['assets/distance_sign.png'] || 'assets/distance_sign.png');
        signImage.setAttribute('x', -signSize / 2);
        signImage.setAttribute('y', -signSize / 2);
        signImage.setAttribute('width', signSize);
        signImage.setAttribute('height', signSize);
        signImage.setAttribute('class', 'distance-sign-image');
        signGroup.appendChild(signImage);
        
        // Create the number text on top of the image
        const numberText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        numberText.setAttribute('x', 0);
        numberText.setAttribute('y', 0);
        numberText.setAttribute('text-anchor', 'middle');
        numberText.setAttribute('dy', '0.1em');
        numberText.setAttribute('dominant-baseline', 'middle');
        numberText.setAttribute('fill', '#000000'); // Black text for visibility on the sign
        numberText.setAttribute('font-size', this.visualSettings.segmentNumberSize * 0.8); // Slightly smaller than the sign
        numberText.setAttribute('font-weight', 'bold');
        numberText.setAttribute('class', 'distance-sign-number');
        numberText.textContent = segment.spacesToNextCurve.toString();
        signGroup.appendChild(numberText);
        
        group.appendChild(signGroup);
        return signGroup;
    }

    createRegularNumber(segment, numberInfo, group) {
        // Calculate rotation angle from direction vector
        const angle = Math.atan2(numberInfo.direction[1], numberInfo.direction[0]) * 180 / Math.PI;
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', numberInfo.position[0]);
        text.setAttribute('y', numberInfo.position[1]);
        text.setAttribute('transform', `rotate(${angle} ${numberInfo.position[0]} ${numberInfo.position[1]})`);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', this.visualSettings.segmentNumberColor);
        text.setAttribute('font-size', this.visualSettings.segmentNumberSize);
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('class', `segment-number ${this.currentMode === 'edit' ? 'draggable' : ''}`);
        text.setAttribute('data-segment-id', segment.segment_number);
        text.style.pointerEvents = (this.currentMode === 'edit' || this.currentMode === 'curve') ? 'auto' : 'none';
        text.style.cursor = this.currentMode === 'edit' ? 'move' : (this.currentMode === 'curve' ? 'pointer' : 'default');
        text.textContent = segment.spacesToNextCurve.toString();
        
        group.appendChild(text);
        return text;
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
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem('heatTrackVisualSettings'));
        } catch (error) {
            console.warn('Ignoring unreadable saved settings:', error);
        }
        // Merge over the defaults so settings added after the save still get a value
        const settings = { ...this.defaultSettings, ...(saved || {}) };
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
        let value;
        
        if (e.target.type === 'color') {
            value = e.target.value; // Color inputs return hex strings
        } else {
            value = parseFloat(e.target.value);
            if (!Number.isFinite(value)) {
                // Empty or invalid input: restore the current value instead of storing NaN
                e.target.value = this.visualSettings[settingName];
                return;
            }
        }

        this.visualSettings[settingName] = value;
        
        if (this.trackData) {
            this.renderTrack(true); // Preserve view when changing visual settings
        }
    }

    onSettingChange(e) {
        if (!this.trackData || !this.centerlinePoints) return;
        
        if (e.target.id === 'trackWidth') {
            // Width doesn't move the spaces, so redraw the edges and keep all edits
            const trackWidth = parseFloat(e.target.value);
            if (!(trackWidth > 0)) {
                e.target.value = this.trackData.track_width;
                return;
            }
            this.generateTrackBorders(trackWidth);
            this.trackData.track_width = trackWidth;
            this.trackData.left_border = this.leftBorderPoints;
            this.trackData.right_border = this.rightBorderPoints;
            this.renderTrack(true);
            this.saveSession();
            return;
        }
        
        // A new space length rebuilds the spaces; restore the old value if the user keeps their edits
        if (!this.generateTrack()) {
            e.target.value = this.trackData.segment_length;
        }
    }

    // Record that the user changed the generated track, then persist it
    markEdited() {
        if (this.trackData) this.trackData.edited = true;
        this.saveSession();
    }

    // Edits are flagged explicitly; curves/kerbs also count for tracks saved before the flag existed
    hasUserEdits() {
        if (!this.trackData) return false;
        return Boolean(this.trackData.edited) ||
            this.trackData.segments.some(s => s.is_curve || s.has_kerb);
    }

    confirmDiscardEdits(action) {
        return !this.hasUserEdits() ||
            confirm(`${action} will discard your curves, kerbs, lines and moved spaces. Continue?\n\nTip: use "Save track" first to keep a copy.`);
    }

    // Mode and interaction methods
    setMode(mode) {
        this.currentMode = mode;
        
        // Update button states
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === `${mode}Mode`);
        });
        
        // Show/hide controls
        document.getElementById('curveControls').style.display = mode === 'curve' ? 'block' : 'none';
        document.getElementById('kerbControls').style.display = mode === 'kerb' ? 'block' : 'none';
        document.getElementById('whiteLineControls').style.display = mode === 'whiteLine' ? 'block' : 'none';
        document.getElementById('editControls').style.display = mode === 'edit' ? 'block' : 'none';
        
        document.getElementById('trackCanvas').style.cursor = this.getCursorForMode();

        // Re-render track so hit areas, cursors and pointer events match the new mode
        if (this.trackData) {
            this.renderTrack(true);
        }
    }

    handleMouseDown(e) {
        if (e.button !== 0) return; // Primary button / touch / pen only

        const svg = document.getElementById('trackCanvas');
        const { x, y } = this.clientToViewBox(e);
        this.lastMouseEvent = e;

        const element = e.target;
        let handledByMode = false;
        
        if (this.currentMode === 'curve') {
            if (element.classList.contains('segment-line')) {
                this.handleCurveSelection(element);
                handledByMode = true;
            } else if (element.classList.contains('segment-number') || element.classList.contains('distance-sign') || element.classList.contains('distance-sign-number') || element.classList.contains('distance-sign-image')) {
                // In curve mode, clicking on numbers or distance signs toggles their side
                this.handleNumberSideToggle(element);
                handledByMode = true;
            } else if (element.classList.contains('speed-limit-text') || element.classList.contains('speed-limit-sign-image') || element.classList.contains('speed-limit-sign-number')) {
                // In curve mode, clicking on speed limits toggles their side
                this.handleSpeedLimitSideToggle(element);
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
            if (element.classList.contains('segment-line') || element.classList.contains('segment-number') || 
                element.classList.contains('distance-sign') || element.classList.contains('distance-sign-number') || 
                element.classList.contains('distance-sign-image')) {
                this.startSegmentDrag(element, x, y);
                handledByMode = true;
            }
        }
        
        // If no mode-specific interaction occurred, or we're in pan mode, allow panning
        if (!handledByMode || this.currentMode === 'pan') {
            // Check if we clicked on an interactive element (but not the background)
            const isInteractiveElement = element.classList.contains('segment-line') || 
                                       element.classList.contains('segment-number') || 
                                       element.classList.contains('distance-sign') ||
                                       element.classList.contains('distance-sign-number') ||
                                       element.classList.contains('distance-sign-image') ||
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

        // Keep receiving move/up events even if the pointer leaves the canvas mid-drag
        if (this.isDragging) {
            svg.setPointerCapture(e.pointerId);
        }
    }

    handleMouseMove(e) {
        // Store the last mouse event for drag operations
        this.lastMouseEvent = e;

        const { x, y } = this.clientToViewBox(e);

        if (this.currentMode === 'edit' && this.isDragging && this.draggedSegmentId) {
            this.updateSegmentDragPreview(x, y);
        } else if (this.isDragging && !this.draggedSegmentId) {
            // Handle panning regardless of current mode (when dragging but not dragging a segment)
            this.panX += x - this.lastPanX;
            this.panY += y - this.lastPanY;
            this.applyViewTransform();

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

        const { x, y } = this.clientToViewBox(e);

        // Zoom limits are relative to the "fit to screen" scale, since track units vary per SVG
        const fitScale = this.fitScale || 1;
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(fitScale * 0.2, Math.min(fitScale * 20, this.scale * scaleFactor));

        // Keep the point under the cursor fixed while zooming
        const scaleChange = newScale / this.scale;
        this.panX = x - (x - this.panX) * scaleChange;
        this.panY = y - (y - this.panY) * scaleChange;
        this.scale = newScale;
        this.applyViewTransform();

        // Save session after view changes (with debouncing)
        this.debouncedSaveSession();
    }

    handleCurveSelection(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        segment.is_curve = !segment.is_curve;
        if (segment.is_curve) {
            // Prompt user for speed limit when creating a curve
            const speedLimit = this.promptForSpeedLimit();
            if (speedLimit !== null) {
                segment.speed_limit = speedLimit;
            } else {
                // User cancelled, revert curve status
                segment.is_curve = false;
                return;
            }
        }
        
        // Recalculate spaces to next curve for all segments since curve status changed
        this.calculateSpacesToNextCurve();

        // Re-render the track to update all segment displays
        this.renderTrack(true); // preserve view
        
        // Save session after curve changes
        this.markEdited();
        
        this.showStatus(`Segment ${segmentId} ${segment.is_curve ? 'marked as curve' : 'unmarked as curve'}`, 'success');
    }

    promptForSpeedLimit() {
        let message = 'Enter speed limit for this curve:';
        for (;;) {
            const speedLimit = prompt(message);

            // Check if user cancelled
            if (speedLimit === null) {
                return null;
            }

            // A speed limit must be a positive whole number (0 would leave the curve without a sign)
            const parsedSpeed = Number(speedLimit.trim());
            if (Number.isInteger(parsedSpeed) && parsedSpeed > 0) {
                return parsedSpeed;
            }
            message = 'Invalid speed limit. Please enter a whole number greater than 0:';
        }
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
        this.markEdited();
    }

    handleNumberSideToggle(element) {
        // Get segment ID from the element or its parent (for distance sign children)
        let segmentId;
        if (element.getAttribute('data-segment-id')) {
            segmentId = parseInt(element.getAttribute('data-segment-id'));
        } else if (element.parentElement && element.parentElement.getAttribute('data-segment-id')) {
            // Handle clicking on children of distance sign group (image or text)
            segmentId = parseInt(element.parentElement.getAttribute('data-segment-id'));
        } else {
            return;
        }
        
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
        this.markEdited();
        
        this.showStatus(`${updatedCount} numbers pointing to curve ${targetCurveSegment.segment_number} moved to ${newSide} side`, 'success');
    }
    
    handleSpeedLimitSideToggle(element) {
        // Get segment ID from the element or its parent group
        let segmentId;
        if (element.id && element.id.startsWith('speed-text-')) {
            // Clicked directly on the group
            segmentId = parseInt(element.id.replace('speed-text-', ''));
        } else if (element.parentElement && element.parentElement.id && element.parentElement.id.startsWith('speed-text-')) {
            // Clicked on a child element (image or text) of the speed limit group
            segmentId = parseInt(element.parentElement.id.replace('speed-text-', ''));
        } else {
            return;
        }
        
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment || !segment.is_curve) return;
        
        // Toggle the side for this speed limit
        const newSide = (segment.speed_limit_side === 'left') ? 'right' : 'left';
        segment.speed_limit_side = newSide;
        
        // Re-render the track to update speed limit position
        this.renderTrack(true); // preserve view
        
        // Save session after changes
        this.markEdited();
        
        this.showStatus(`Speed limit for curve ${segmentId} moved to ${newSide} side`, 'success');
    }
    
    // Find which curve segment this segment is pointing to
    findTargetCurveForSegment(segment) {
        if (!segment.targetCurveId) return null;
        
        return this.trackData.segments.find(s => s.segment_number === segment.targetCurveId);
    }

    startSegmentDrag(element, x, y) {
        this.isDragging = true;
        this.dragStartX = x;
        this.dragStartY = y;
        
        // Get segment ID from element or its parent
        let segmentId;
        if (element.getAttribute('data-segment-id')) {
            segmentId = element.getAttribute('data-segment-id');
        } else if (element.parentElement && element.parentElement.getAttribute('data-segment-id')) {
            // Handle clicking on children of distance sign group (image or text)
            segmentId = element.parentElement.getAttribute('data-segment-id');
        } else if (element.classList.contains('segment-number')) {
            // If clicked on segment number, use the segment ID
            segmentId = element.getAttribute('data-segment-id');
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

        // Convert viewBox coordinates to track coordinates
        const trackPoint = this.viewBoxToTrack(x, y);

        // Find the closest point on the centerline
        const closestPoint = this.findClosestPointOnCenterline(trackPoint.x, trackPoint.y);

        if (closestPoint) {
            // Update visual preview of where the segment would be placed
            this.showSegmentDragPreview(closestPoint);
        }
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
        
        // Use the last pointer position from the stored event
        if (this.lastMouseEvent) {
            const { x, y } = this.clientToViewBox(this.lastMouseEvent);
            const trackPoint = this.viewBoxToTrack(x, y);
            const closestPoint = this.findClosestPointOnCenterline(trackPoint.x, trackPoint.y);
            
            if (closestPoint) {
                this.moveSegmentToPosition(this.draggedSegmentId, closestPoint);
            }
        }
        
        this.cancelSegmentDrag();
    }

    moveSegmentToPosition(segmentId, closestPoint) {
        const segments = this.trackData.segments;
        const segmentIndex = segments.findIndex(s => s.segment_number === segmentId);
        const segment = segments[segmentIndex];
        if (!segment || !closestPoint) return;

        const distances = this.getCumulativeDistances();
        const totalLength = distances[distances.length - 1];

        // Keep segments in order: a line can't be dragged onto or past its neighbours
        const minGap = (this.trackData.segment_length || 300) * 0.1;
        const lowerBound = segmentIndex > 0 ? segments[segmentIndex - 1].distance + minGap : 0;
        const upperBound = segmentIndex < segments.length - 1 ? segments[segmentIndex + 1].distance - minGap : totalLength - minGap;
        if (lowerBound > upperBound) {
            this.showStatus(`No room to move segment ${segmentId}`, 'warning');
            return;
        }
        const newDistance = Math.min(Math.max(distances[closestPoint.index], lowerBound), upperBound);
        const { index, t } = this.locateDistance(newDistance);

        // Update the moved segment's position
        segment.distance = newDistance;
        segment.centerline_index = index;
        segment.interpolation_t = t;

        // Re-render the track to update segment fills based on new positions
        this.renderTrack(true); // Preserve view when moving segments
        
        // Save session after segment movement
        this.markEdited();
        
        this.showStatus(`Segment ${segmentId} moved - adjacent segments updated`, 'success');
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

        svg.style.cursor = this.getCursorForMode();
    }

    // White line methods (similar to kerb methods but for solid white lines)
    handleWhiteLineAreaSelection(element) {
        const segmentId = parseInt(element.getAttribute('data-segment-id'));
        const side = element.getAttribute('data-side');
        
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        // Find which curve this segment is pointing to
        const targetCurveSegment = this.findTargetCurveForSegment(segment);
        if (!targetCurveSegment) {
            this.showStatus(`No target curve found for segment ${segmentId}`, 'warning');
            return;
        }
        
        // Get all segments that point to the same target curve
        const relatedSegments = this.trackData.segments.filter(seg => {
            const segTargetCurve = this.findTargetCurveForSegment(seg);
            return segTargetCurve && segTargetCurve.segment_number === targetCurveSegment.segment_number;
        });
        
        // Initialize white line properties if they don't exist
        if (!segment.has_white_line) {
            segment.has_white_line = false;
            segment.white_line_side = 'left'; // Default to left, but will be set by clicked side
        }
        
        let actionDescription = '';
        let updatedCount = 0;
        
        if (!segment.has_white_line) {
            // First click: enable white line on the clicked side for all related segments
            relatedSegments.forEach(seg => {
                seg.has_white_line = true;
                seg.white_line_side = side;
                updatedCount++;
            });
            actionDescription = `white lines added (${side} side)`;
        } else {
            // If clicking the same side, remove white line from all related segments
            if (segment.white_line_side === side) {
                relatedSegments.forEach(seg => {
                    seg.has_white_line = false;
                    updatedCount++;
                });
                actionDescription = `white lines removed`;
            } else {
                // Clicking the opposite side, switch all related segments to that side
                relatedSegments.forEach(seg => {
                    seg.white_line_side = side;
                    updatedCount++;
                });
                actionDescription = `white lines switched to ${side} side`;
            }
        }
        
        this.renderTrack(true); // Preserve view when toggling white lines
        
        // Save session after white line changes
        this.markEdited();
        
        this.showStatus(`${updatedCount} segments pointing to curve ${targetCurveSegment.segment_number}: ${actionDescription}`, 'success');
    }

    createWhiteLineHitAreas(segment, group) {
        // Only create white line hit areas in white line mode
        if (this.currentMode !== 'whiteLine') return;
        
        const totalLength = this.calculateTrackLength();
        const startRatio = (segment.distance || 0) / totalLength;
        const endRatio = Math.min(this.getSegmentEndDistance(segment) / totalLength, 1);

        const trackBorderDistance = (this.trackData.track_width / 2);

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
            leftHitArea.setAttribute('stroke-width', '16'); // Clickable width in screen pixels
            leftHitArea.setAttribute('vector-effect', 'non-scaling-stroke');
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
            rightHitArea.setAttribute('stroke-width', '16'); // Clickable width in screen pixels
            rightHitArea.setAttribute('vector-effect', 'non-scaling-stroke');
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

    createUnifiedWhiteLineForGroup(whiteLineGroup, group) {
        // Calculate the combined boundaries of all segments in the group
        const segments = whiteLineGroup.segments;
        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];
        
        // Calculate the start and end positions
        const totalLength = this.calculateTrackLength();
        const startRatio = (firstSegment.distance || 0) / totalLength;
        const endRatio = Math.min(this.getSegmentEndDistance(lastSegment) / totalLength, 1);
        
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
            whiteLinePath.setAttribute('stroke', this.visualSettings.whiteLineColor);
            whiteLinePath.setAttribute('stroke-width', this.visualSettings.whiteLineWidth);
            whiteLinePath.setAttribute('fill', 'none');
            whiteLinePath.setAttribute('id', `${groupId}-${side}`);
            whiteLinePath.setAttribute('class', 'white-line');
            group.appendChild(whiteLinePath);
        }
    }

    createKerbPath(points, id, group) {
        if (points.length < 2) return;
        
        const pathData = points.map((point, index) => 
            `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`
        ).join(' ');
        
        // Create base white kerb stripe
        const whiteKerbPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        whiteKerbPath.setAttribute('d', pathData);
        whiteKerbPath.setAttribute('stroke', this.visualSettings.kerbWhiteColor);
        whiteKerbPath.setAttribute('stroke-width', this.visualSettings.kerbWidth);
        whiteKerbPath.setAttribute('fill', 'none');
        whiteKerbPath.style.pointerEvents = 'none';
        group.appendChild(whiteKerbPath);
        
        // Create red striped pattern on top
        const redKerbPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        redKerbPath.setAttribute('d', pathData);
        redKerbPath.setAttribute('stroke', this.visualSettings.kerbRedColor);
        redKerbPath.setAttribute('stroke-width', this.visualSettings.kerbWidth);
        redKerbPath.setAttribute('stroke-dasharray', `${this.visualSettings.kerbDashLength} ${this.visualSettings.kerbGapLength}`);
        redKerbPath.setAttribute('fill', 'none');
        redKerbPath.style.pointerEvents = 'none';
        group.appendChild(redKerbPath);
    }

    calculateTrackLength() {
        const distances = this.getCumulativeDistances();
        return distances[distances.length - 1] || 1000;
    }

    // Export methods
    exportTrack(format) {
        if (!this.trackData) {
            this.showStatus('No track to export', 'error');
            return;
        }

        if (format === 'svg') {
            this.exportSVG();
        } else if (format === 'png') {
            this.exportPNG();
        }
    }

    // Build a standalone SVG of the whole track, independent of the current pan/zoom,
    // without the editor-only hit areas and inline interaction styles
    buildExportSVG() {
        const trackGroup = document.querySelector('#trackCanvas #trackGroup');
        const bbox = trackGroup.getBBox(); // In track units, excludes the group's own pan/zoom transform
        const margin = Math.max(this.visualSettings.whiteLineWidth, this.visualSettings.kerbWidth, this.visualSettings.borderWidth) + 20;
        const viewBox = {
            x: bbox.x - margin,
            y: bbox.y - margin,
            width: bbox.width + margin * 2,
            height: bbox.height + margin * 2
        };

        const clone = trackGroup.cloneNode(true);
        clone.removeAttribute('transform');
        clone.removeAttribute('id');
        clone.querySelectorAll('.segment-line, .kerb-hit-area, .white-line-hit-area').forEach(el => el.remove());
        clone.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
        clone.querySelectorAll('.segment-being-dragged').forEach(el => el.classList.remove('segment-being-dragged'));

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        svg.setAttribute('width', viewBox.width);
        svg.setAttribute('height', viewBox.height);
        svg.appendChild(clone);
        return { svg, width: viewBox.width, height: viewBox.height };
    }

    exportSVG() {
        const { svg } = this.buildExportSVG();
        const svgData = new XMLSerializer().serializeToString(svg);
        this.downloadBlob(new Blob([svgData], { type: 'image/svg+xml' }), 'heat_track.svg');
        this.showStatus('Track exported as SVG', 'success');
    }

    exportPNG() {
        const { svg, width, height } = this.buildExportSVG();

        // Browsers cap canvas dimensions (~16k px per side), so clamp the requested width
        const MAX_CANVAS_SIDE = 16000;
        const requestedWidth = parseInt(document.getElementById('exportWidth').value) || 4000;
        const pixelScale = Math.min(requestedWidth / width, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
        const canvasWidth = Math.round(width * pixelScale);
        const canvasHeight = Math.round(height * pixelScale);

        // Rasterize the SVG at the output size so it stays sharp and keeps its aspect ratio
        svg.setAttribute('width', canvasWidth);
        svg.setAttribute('height', canvasHeight);
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgUrl = URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }));

        this.showLoading(true);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(svgUrl);
            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            // Background is left transparent
            canvas.getContext('2d').drawImage(img, 0, 0, canvasWidth, canvasHeight);

            canvas.toBlob(blob => {
                this.showLoading(false);
                if (!blob) {
                    this.showStatus('PNG export failed: image too large, try a smaller width', 'error');
                    return;
                }
                this.downloadBlob(blob, 'heat_track.png');
                this.showStatus(`Track exported as PNG (${canvasWidth}×${canvasHeight})`, 'success');
            });
        };
        img.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            this.showLoading(false);
            this.showStatus('PNG export failed', 'error');
        };
        img.src = svgUrl;
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // Revoking immediately can cancel the download in some browsers
        setTimeout(() => {
            link.remove();
            URL.revokeObjectURL(url);
        }, 1000);
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
            
            // Restore track data (or just the centerline preview if no track was generated yet).
            // Nothing here may save the session before trackData is restored, or the track is lost.
            if (sessionData.trackData) {
                this.trackData = sessionData.trackData;
                // Share one array so cached distances apply to both
                this.centerlinePoints = this.trackData.centerline;
                this.renderTrack();

                // Restore view state after track is rendered
                if (sessionData.viewState) {
                    this.scale = sessionData.viewState.scale || this.scale;
                    this.panX = sessionData.viewState.panX || 0;
                    this.panY = sessionData.viewState.panY || 0;
                    this.applyViewTransform();
                }
            } else if (sessionData.centerlinePoints && sessionData.centerlinePoints.length > 0) {
                this.centerlinePoints = sessionData.centerlinePoints;
                this.showCenterlinePreview();
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

    // Track save/load methods
    saveTrackToFile() {
        if (!this.trackData || !this.centerlinePoints) {
            this.showStatus('No track data to save. Please load a track first.', 'error');
            return;
        }

        try {
            // Create comprehensive track data including all modifications
            const trackSaveData = {
                version: "1.0",
                timestamp: Date.now(),
                centerlinePoints: this.centerlinePoints,
                trackData: this.trackData,
                visualSettings: this.visualSettings,
                metadata: {
                    trackWidth: this.trackData.track_width,
                    segmentLength: this.trackData.segment_length,
                    totalSegments: this.trackData.segments.length,
                    curvesCount: this.trackData.segments.filter(s => s.is_curve).length,
                    kerbsCount: this.trackData.segments.filter(s => s.has_kerb).length,
                    whiteLinesCount: this.trackData.segments.filter(s => s.has_white_line).length
                }
            };

            // Create filename with timestamp
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
            const filename = `heat_track_${timestamp}.json`;

            const jsonString = JSON.stringify(trackSaveData, null, 2);
            this.downloadBlob(new Blob([jsonString], { type: 'application/json' }), filename);

            this.showStatus(`Track saved as ${filename}`, 'success');

        } catch (error) {
            console.error('Error saving track:', error);
            this.showStatus('Failed to save track', 'error');
        }
    }

    async loadTrackFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // Read the file
            const fileContent = await this.readFileAsText(file);
            const trackData = JSON.parse(fileContent);
            
            // Validate the file format
            if (!trackData.version || !trackData.centerlinePoints || !trackData.trackData) {
                throw new Error('Invalid track file format');
            }
            
            // Load the track data (one shared centerline array, as after generating)
            this.trackData = trackData.trackData;
            this.centerlinePoints = this.trackData.centerline || trackData.centerlinePoints;
            this.trackData.centerline = this.centerlinePoints;
            
            // Load visual settings if available
            if (trackData.visualSettings) {
                this.visualSettings = { ...this.visualSettings, ...trackData.visualSettings };
                this.applySettingsToUI(this.visualSettings);
            }
            
            // Update UI controls with loaded track settings
            if (this.trackData.track_width) {
                const trackWidthInput = document.getElementById('trackWidth');
                if (trackWidthInput) trackWidthInput.value = this.trackData.track_width;
            }
            
            if (this.trackData.segment_length) {
                const segmentLengthInput = document.getElementById('segmentLength');
                if (segmentLengthInput) segmentLengthInput.value = this.trackData.segment_length;
            }
            
            // Render the track with all modifications
            this.renderTrack();
            
            // Set default mode to curve for immediate editing
            this.setMode('curve');
            
            // Save to session for persistence
            this.saveSession();
            
            // Show success message with metadata
            const metadata = trackData.metadata;
            let statusMessage = `Track loaded successfully!`;
            if (metadata) {
                statusMessage += ` (${metadata.totalSegments} segments, ${metadata.curvesCount} curves`;
                if (metadata.kerbsCount > 0) statusMessage += `, ${metadata.kerbsCount} kerbs`;
                if (metadata.whiteLinesCount > 0) statusMessage += `, ${metadata.whiteLinesCount} white lines`;
                statusMessage += ')';
            }
            
            this.showStatus(statusMessage, 'success');
            
        } catch (error) {
            console.error('Error loading track:', error);
            this.showStatus('Failed to load track file. Please check the file format.', 'error');
        } finally {
            // Clear the file input so the same file can be loaded again
            event.target.value = '';
        }
    }

    // Utility methods
    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';

        // Restart the timer so an older message's timeout doesn't hide this one early
        clearTimeout(this.statusTimeout);
        this.statusTimeout = setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new HeatTrackGenerator();
});
