"""
Flask web application for Heat: Pedal to the Metal racetrack generator
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import json
import tempfile
from werkzeug.utils import secure_filename
import base64
from io import BytesIO
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from main import HeatTrackGenerator

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Store track generators per session (in production, use Redis or database)
track_generators = {}

# File to store last track data
LAST_TRACK_FILE = 'last_track_data.json'

def save_track_data(track_data, filename, session_id):
    """Save track data to file for persistence"""
    try:
        save_data = {
            'track_data': track_data,
            'filename': filename,
            'session_id': session_id,
            'timestamp': json.dumps({"timestamp": "auto"})  # You could add actual timestamp
        }
        
        with open(LAST_TRACK_FILE, 'w') as f:
            json.dump(save_data, f)
        print(f"Track data saved to {LAST_TRACK_FILE}")
    except Exception as e:
        print(f"Error saving track data: {e}")

def load_track_data():
    """Load the last track data from file"""
    try:
        if os.path.exists(LAST_TRACK_FILE):
            with open(LAST_TRACK_FILE, 'r') as f:
                data = json.load(f)
            print(f"Track data loaded from {LAST_TRACK_FILE}")
            return data
    except Exception as e:
        print(f"Error loading track data: {e}")
    return None

@app.route('/')
def index():
    """Main page with the track editor interface"""
    return render_template('index.html')

@app.route('/api/last-track', methods=['GET'])
def get_last_track():
    """Get the last generated track data"""
    try:
        last_data = load_track_data()
        if last_data:
            # Check if the SVG file still exists
            filename = last_data.get('filename')
            if filename:
                svg_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                if os.path.exists(svg_path):
                    return jsonify({
                        'success': True,
                        'has_track': True,
                        'track_data': last_data['track_data'],
                        'filename': filename,
                        'session_id': last_data['session_id']
                    })
                else:
                    return jsonify({
                        'success': True,
                        'has_track': False,
                        'message': 'SVG file no longer exists'
                    })
            
        return jsonify({
            'success': True,
            'has_track': False,
            'message': 'No previous track found'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_svg():
    """Handle SVG file upload"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if file and file.filename.lower().endswith('.svg'):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            # Generate a session ID (in production, use proper session management)
            session_id = f"session_{len(track_generators)}"
            
            return jsonify({
                'success': True,
                'session_id': session_id,
                'filename': filename,
                'filepath': filepath
            })
        else:
            return jsonify({'error': 'Invalid file type. Please upload an SVG file.'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate', methods=['POST'])
def generate_track():
    """Generate track from uploaded SVG with given parameters"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        filename = data.get('filename')  # Get filename instead of full path
        track_width = float(data.get('track_width', 200))
        segment_length = float(data.get('segment_length', 400))
        
        # Construct the full path
        svg_path = os.path.join(app.config['UPLOAD_FOLDER'], filename) if filename else None
        
        if not svg_path or not os.path.exists(svg_path):
            return jsonify({'error': 'SVG file not found'}), 400
        
        # Create track generator
        generator = HeatTrackGenerator(track_width=track_width, segment_length=segment_length)
        
        # Generate track
        generator.parse_svg_centerline(svg_path)
        generator.generate_track_borders()
        generator.divide_track_into_segments()
        
        # Store generator for this session
        track_generators[session_id] = generator
        
        # Return track data as JSON
        track_data = {
            'centerline': generator.centerline_points,
            'left_border': generator.left_border_points,
            'right_border': generator.right_border_points,
            'segments': generator.segment_divisions,
            'track_width': track_width,
            'segment_length': segment_length
        }
        
        # Save track data for persistence
        save_track_data(track_data, filename, session_id)
        
        return jsonify({
            'success': True,
            'track_data': track_data,
            'session_id': session_id
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update_segments', methods=['POST'])
def update_segments():
    """Update segment positions after user drags them"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        segments = data.get('segments')
        
        if session_id not in track_generators:
            return jsonify({'error': 'Session not found'}), 400
        
        generator = track_generators[session_id]
        
        # Update segment positions
        for segment_update in segments:
            segment_id = segment_update['id']
            new_position = segment_update['position']
            
            # Find and update the segment
            for segment in generator.segment_divisions:
                if segment['segment_number'] == segment_id:
                    segment['center_point'] = new_position
                    # Recalculate line start/end points based on new center
                    # This would need more sophisticated logic for proper perpendicular calculation
                    break
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export', methods=['POST'])
def export_track():
    """Export track as SVG or PNG"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        export_format = data.get('format', 'png')
        
        if session_id not in track_generators:
            return jsonify({'error': 'Session not found'}), 400
        
        generator = track_generators[session_id]
        
        # Generate plot
        fig, ax = generator.plot_track()
        
        if export_format.lower() == 'png':
            # Save to BytesIO buffer
            img_buffer = BytesIO()
            fig.savefig(img_buffer, format='png', dpi=300, bbox_inches='tight')
            img_buffer.seek(0)
            
            # Convert to base64 for JSON response
            img_base64 = base64.b64encode(img_buffer.getvalue()).decode()
            plt.close(fig)
            
            return jsonify({
                'success': True,
                'format': 'png',
                'data': img_base64
            })
        
        elif export_format.lower() == 'svg':
            # For SVG export, we'd need to create actual SVG elements
            # This is a simplified version
            svg_buffer = BytesIO()
            fig.savefig(svg_buffer, format='svg', bbox_inches='tight')
            svg_buffer.seek(0)
            
            svg_content = svg_buffer.getvalue().decode()
            plt.close(fig)
            
            return jsonify({
                'success': True,
                'format': 'svg',
                'data': svg_content
            })
        
        else:
            return jsonify({'error': 'Unsupported export format'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/mark_curve', methods=['POST'])
def mark_curve():
    """Mark a range of segments as a curve with speed limit"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        start_segment = int(data.get('start_segment'))
        end_segment = int(data.get('end_segment'))
        speed_limit = int(data.get('speed_limit', 3))
        
        if session_id not in track_generators:
            return jsonify({'error': 'Session not found'}), 400
        
        generator = track_generators[session_id]
        
        # Mark segments as curves
        for segment in generator.segment_divisions:
            segment_num = segment['segment_number']
            if start_segment <= segment_num <= end_segment:
                segment['is_curve'] = True
                segment['speed_limit'] = speed_limit
            else:
                segment['is_curve'] = segment.get('is_curve', False)
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
