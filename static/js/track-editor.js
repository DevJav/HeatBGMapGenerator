/**
 * Heat Track Editor - Interactive JavaScript functionality
 */

class TrackEditor {
    constructor() {
        this.sessionId = null;
        this.trackData = null;
        this.currentMode = 'pan';
        this.isDragging = false;
        this.draggedElement = null;
        this.curveSelection = [];
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        
        this.initializeEventListeners();
        this.setupSVGInteraction();
        this.loadLastTrack(); // Check for and load previous track
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

        // Export buttons
        document.getElementById('exportPNG').addEventListener('click', () => this.exportTrack('png'));
        document.getElementById('exportSVG').addEventListener('click', () => this.exportTrack('svg'));

        // Settings change listeners
        document.getElementById('trackWidth').addEventListener('change', this.updateSettings.bind(this));
        document.getElementById('segmentLength').addEventListener('change', this.updateSettings.bind(this));
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
            this.uploadFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.uploadFile(file);
        }
    }

    async uploadFile(file) {
        if (!file.name.toLowerCase().endsWith('.svg')) {
            this.showStatus('Please select an SVG file', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        this.showLoading(true);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.sessionId = result.session_id;
                this.showStatus(`File uploaded: ${result.filename}`, 'success');
                document.getElementById('fileName').textContent = `📄 ${result.filename}`;
                document.getElementById('generateBtn').disabled = false;
            } else {
                this.showStatus(result.error, 'error');
            }
        } catch (error) {
            this.showStatus('Upload failed: ' + error.message, 'error');
        }

        this.showLoading(false);
    }

    async loadLastTrack() {
        /**
         * Load the last generated track on page load
         */
        try {
            const response = await fetch('/api/last-track');
            const result = await response.json();
            
            if (result.success && result.has_track) {
                // Restore track data
                this.trackData = result.track_data;
                this.sessionId = result.session_id;
                
                // Update UI
                document.getElementById('fileName').textContent = `📄 ${result.filename}`;
                document.getElementById('generateBtn').disabled = false;
                
                // Update settings from saved data
                document.getElementById('trackWidth').value = result.track_data.track_width;
                document.getElementById('segmentLength').value = result.track_data.segment_length;
                
                // Render the track
                this.renderTrack();
                
                // this.showStatus('Previous track loaded successfully!', 'success');
                console.log('Loaded previous track data');
            } else {
                console.log('No previous track found or file missing');
            }
        } catch (error) {
            console.log('Error loading previous track:', error);
            // Don't show error to user since this is just a convenience feature
        }
    }

    async generateTrack() {
        if (!this.sessionId) {
            this.showStatus('Please upload an SVG file first', 'error');
            return;
        }

        const trackWidth = document.getElementById('trackWidth').value;
        const segmentLength = document.getElementById('segmentLength').value;

        this.showLoading(true);

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    filename: document.getElementById('fileName').textContent.replace('📄 ', ''),
                    track_width: parseFloat(trackWidth),
                    segment_length: parseFloat(segmentLength)
                })
            });

            const result = await response.json();

            if (result.success) {
                this.trackData = result.track_data;
                this.renderTrack();
                this.showStatus('Track generated successfully!', 'success');
            } else {
                this.showStatus(result.error, 'error');
            }
        } catch (error) {
            this.showStatus('Generation failed: ' + error.message, 'error');
        }

        this.showLoading(false);
    }

    renderTrack() {
        if (!this.trackData) return;

        const svg = document.getElementById('trackCanvas');
        
        // Clear existing track and placeholder text
        const existingTrack = svg.querySelector('#trackGroup');
        if (existingTrack) {
            existingTrack.remove();
        }
        
        // Remove placeholder text
        const placeholderText = svg.querySelector('text');
        if (placeholderText) {
            placeholderText.remove();
        }

        // Create main group for track elements
        const trackGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        trackGroup.id = 'trackGroup';
        
        // Calculate bounds for auto-centering
        const bounds = this.calculateBounds();
        const viewBoxWidth = 1000;
        const viewBoxHeight = 800;
        
        // Auto-scale and center
        const scaleX = viewBoxWidth / (bounds.maxX - bounds.minX + 100);
        const scaleY = viewBoxHeight / (bounds.maxY - bounds.minY + 100);
        this.scale = Math.min(scaleX, scaleY, 2); // Limit max scale
        
        this.panX = (viewBoxWidth - (bounds.maxX - bounds.minX) * this.scale) / 2 - bounds.minX * this.scale;
        this.panY = (viewBoxHeight - (bounds.maxY - bounds.minY) * this.scale) / 2 - bounds.minY * this.scale;
        
        trackGroup.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);

        // Render track fill (black)
        this.renderTrackFill(trackGroup);
        
        // Render track borders (white)
        this.renderTrackBorders(trackGroup);
        
        // Render centerline (dashed white)
        this.renderCenterline(trackGroup);
        
        // Render segment divisions
        this.renderSegmentDivisions(trackGroup);

        svg.appendChild(trackGroup);
    }

    calculateBounds() {
        const allPoints = [
            ...this.trackData.centerline,
            ...this.trackData.left_border,
            ...this.trackData.right_border
        ];

        const bounds = {
            minX: Math.min(...allPoints.map(p => p[0])),
            maxX: Math.max(...allPoints.map(p => p[0])),
            minY: Math.min(...allPoints.map(p => p[1])),
            maxY: Math.max(...allPoints.map(p => p[1]))
        };

        return bounds;
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

    // Helper method to create speed limit text element
    createSpeedLimitText(segment, group = null) {
        const speedText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        speedText.setAttribute('id', `speed-text-${segment.segment_number}`);
        speedText.setAttribute('x', segment.center_point[0] + 20);
        speedText.setAttribute('y', segment.center_point[1]);
        speedText.setAttribute('text-anchor', 'middle');
        speedText.setAttribute('dominant-baseline', 'middle');
        speedText.setAttribute('fill', 'yellow');
        speedText.setAttribute('font-size', '64');
        speedText.setAttribute('font-weight', 'bold');
        speedText.setAttribute('stroke', 'black');
        speedText.setAttribute('stroke-width', '0.5');
        speedText.setAttribute('class', 'speed-limit-text');
        speedText.style.pointerEvents = 'none';
        speedText.textContent = segment.speed_limit;
        
        if (group) {
            group.appendChild(speedText);
        }
        
        return speedText;
    }

    // Helper method to get stroke width for segments
    getSegmentStrokeWidth(isCurve) {
        return isCurve ? '25' : '8';
    }

    renderTrackBorders(group) {
        // Left border
        const leftPath = this.createPathFromPoints(this.trackData.left_border);
        leftPath.setAttribute('stroke', 'white');
        leftPath.setAttribute('stroke-width', '5');
        leftPath.setAttribute('fill', 'none');
        group.appendChild(leftPath);

        // Right border
        const rightPath = this.createPathFromPoints(this.trackData.right_border);
        rightPath.setAttribute('stroke', 'white');
        rightPath.setAttribute('stroke-width', '5');
        rightPath.setAttribute('fill', 'none');
        group.appendChild(rightPath);
    }

    renderCenterline(group) {
        const centerPath = this.createPathFromPoints(this.trackData.centerline);
        centerPath.setAttribute('stroke', 'white');
        centerPath.setAttribute('stroke-width', '10');
        centerPath.setAttribute('stroke-dasharray', '25 25');
        centerPath.setAttribute('fill', 'none');
        centerPath.setAttribute('opacity', '1');
        group.appendChild(centerPath);
    }

    renderSegmentDivisions(group) {
        this.trackData.segments.forEach(segment => {
            // Create the visible segment line
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
            line.style.pointerEvents = 'none'; // Disable pointer events on visual line
            
            group.appendChild(line);

            // Create an invisible wider line for easier selection
            const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hitArea.setAttribute('x1', segment.line_start[0]);
            hitArea.setAttribute('y1', segment.line_start[1]);
            hitArea.setAttribute('x2', segment.line_end[0]);
            hitArea.setAttribute('y2', segment.line_end[1]);
            hitArea.setAttribute('stroke', 'transparent');
            hitArea.setAttribute('stroke-width', '25'); // Much wider for easier clicking
            hitArea.setAttribute('opacity', '0');
            hitArea.setAttribute('class', 'segment-line');
            hitArea.setAttribute('data-segment-id', segment.segment_number);
            hitArea.style.cursor = this.currentMode === 'edit' ? 'move' : 
                                  this.currentMode === 'curve' ? 'pointer' : 'default';
            
            group.appendChild(hitArea);

            // Add segment number
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', segment.center_point[0]);
            text.setAttribute('y', segment.center_point[1]);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', 'white');
            text.setAttribute('font-size', '12');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('class', 'segment-number');
            text.setAttribute('stroke', 'black');
            text.setAttribute('stroke-width', '0.5');
            text.setAttribute('data-segment-id', segment.segment_number);
            text.style.pointerEvents = 'none'; // Prevent text from blocking clicks
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

    setMode(mode) {
        this.currentMode = mode;
        this.curveSelection = [];
        
        // Update button states
        document.querySelectorAll('.toolbar .btn').forEach(btn => {
            btn.style.opacity = '0.7';
        });
        
        document.getElementById(`${mode}Mode`).style.opacity = '1';
        
        // Show/hide curve controls
        const curveControls = document.getElementById('curveControls');
        curveControls.style.display = mode === 'curve' ? 'block' : 'none';
        
        // Update cursor and interaction
        const svg = document.getElementById('trackCanvas');
        const segmentLines = svg.querySelectorAll('.segment-line');
        
        segmentLines.forEach(line => {
            line.style.cursor = mode === 'edit' ? 'move' : 
                               mode === 'curve' ? 'pointer' : 'default';
        });
        
        svg.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
    }

    handleMouseDown(e) {
        const svg = document.getElementById('trackCanvas');
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.currentMode === 'edit') {
            const element = e.target;
            if (element.classList.contains('segment-line')) {
                this.isDragging = true;
                this.draggedElement = element;
                svg.style.cursor = 'grabbing';
            }
        } else if (this.currentMode === 'curve') {
            const element = e.target;
            if (element.classList.contains('segment-line')) {
                this.handleCurveSelection(element);
            }
        } else if (this.currentMode === 'pan') {
            this.isDragging = true;
            this.lastPanX = x;
            this.lastPanY = y;
            svg.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;

        const svg = document.getElementById('trackCanvas');
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.currentMode === 'edit' && this.draggedElement) {
            // Convert screen coordinates to SVG coordinates
            const point = svg.createSVGPoint();
            point.x = x;
            point.y = y;
            const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
            
            // Update segment line position (simplified - would need proper perpendicular calculation)
            // This is a basic implementation for demonstration
            const segmentId = this.draggedElement.getAttribute('data-segment-id');
            // In a full implementation, you'd recalculate the perpendicular line here
            
        } else if (this.currentMode === 'pan') {
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

    handleMouseUp(e) {
        this.isDragging = false;
        this.draggedElement = null;
        
        const svg = document.getElementById('trackCanvas');
        svg.style.cursor = this.currentMode === 'pan' ? 'grab' : 'crosshair';
    }

    handleWheel(e) {
        e.preventDefault();
        
        const svg = document.getElementById('trackCanvas');
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(5, this.scale * scaleFactor));
        
        // Zoom towards mouse position
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
        
        // Find the segment in our data
        const segment = this.trackData.segments.find(s => s.segment_number === segmentId);
        if (!segment) return;
        
        // Toggle curve status
        const wasCurve = segment.is_curve || false;
        segment.is_curve = !wasCurve;
        
        if (segment.is_curve) {
            // Set default speed limit if not already set
            segment.speed_limit = segment.speed_limit || parseInt(document.getElementById('speedLimit').value);
        }
        
        // Update the visual representation
        this.updateSegmentVisual(segmentId, segment);
        
        this.showStatus(`Segment ${segmentId} ${segment.is_curve ? 'marked as curve' : 'unmarked as curve'}`, 'success');
    }

    updateSegmentVisual(segmentId, segment) {
        /**
         * Update the visual representation of a segment (curve vs normal)
         */
        const svg = document.getElementById('trackCanvas');
        const trackGroup = svg.querySelector('#trackGroup');
        
        if (!trackGroup) return;
        
        // Find the visual line
        const visualLine = trackGroup.querySelector(`[data-segment-id="${segmentId}"].segment-line-visual`);
        const speedTextId = `speed-text-${segmentId}`;
        let speedText = trackGroup.querySelector(`#${speedTextId}`);
        
        if (visualLine) {
            if (segment.is_curve) {
                // Make it thicker for curves but keep white color
                visualLine.setAttribute('stroke-width', this.getSegmentStrokeWidth(true));
                visualLine.setAttribute('stroke', 'white');
                
                // Add speed limit text if it doesn't exist
                if (!speedText) {
                    speedText = this.createSpeedLimitText(segment, trackGroup);
                } else {
                    // Update existing text position and content
                    speedText.setAttribute('x', segment.center_point[0] + 20);
                    speedText.setAttribute('y', segment.center_point[1]);
                    speedText.textContent = segment.speed_limit;
                }
                
            } else {
                // Normal segment - thinner line
                visualLine.setAttribute('stroke-width', this.getSegmentStrokeWidth(false));
                visualLine.setAttribute('stroke', 'white');
                
                // Remove speed limit text if it exists
                if (speedText) {
                    speedText.remove();
                }
            }
        }
    }

    async markCurveRange(startSegment, endSegment) {
        const speedLimit = document.getElementById('speedLimit').value;
        
        try {
            const response = await fetch('/api/mark_curve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    start_segment: startSegment,
                    end_segment: endSegment,
                    speed_limit: parseInt(speedLimit)
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showStatus(`Curve marked: segments ${startSegment}-${endSegment}`, 'success');
                // Re-generate track to show curve markings
                this.generateTrack();
            } else {
                this.showStatus(result.error, 'error');
            }
        } catch (error) {
            this.showStatus('Failed to mark curve: ' + error.message, 'error');
        }
    }

    async exportTrack(format) {
        if (!this.sessionId) {
            this.showStatus('No track to export', 'error');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    format: format
                })
            });

            const result = await response.json();

            if (result.success) {
                if (format === 'png') {
                    const link = document.createElement('a');
                    link.href = 'data:image/png;base64,' + result.data;
                    link.download = 'heat_track.png';
                    link.click();
                } else if (format === 'svg') {
                    const blob = new Blob([result.data], { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'heat_track.svg';
                    link.click();
                    URL.revokeObjectURL(url);
                }
                
                this.showStatus(`Track exported as ${format.toUpperCase()}`, 'success');
            } else {
                this.showStatus(result.error, 'error');
            }
        } catch (error) {
            this.showStatus('Export failed: ' + error.message, 'error');
        }

        this.showLoading(false);
    }

    updateSettings() {
        if (this.trackData) {
            // Regenerate track with new settings
            this.generateTrack();
        }
    }

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
}

// Initialize the track editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TrackEditor();
});
