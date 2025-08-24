"""
Heat: Pedal to the Metal - Racetrack Generator

This program generates custom racetracks for the board game Heat: Pedal to the Metal.
It takes an SVG file with a centerline spline and creates a track with borders and segments.
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from svgpathtools import svg2paths, Path, Line, CubicBezier, QuadraticBezier
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
import argparse
import os

class HeatTrackGenerator:
    def __init__(self, track_width=50, segment_length=20):
        """
        Initialize the track generator.
        
        Args:
            track_width (float): Width of the track in units
            segment_length (float): Length of each segment in units
        """
        self.track_width = track_width
        self.segment_length = segment_length
        self.centerline_points = []
        self.left_border_points = []
        self.right_border_points = []
        self.segment_divisions = []
        
    def parse_svg_centerline(self, svg_file_path):
        """
        Parse SVG file and extract the centerline spline from the first path.
        
        Args:
            svg_file_path (str): Path to the SVG file
            
        Returns:
            list: Points along the centerline
        """
        print(f"Parsing SVG file: {svg_file_path}")
        
        try:
            paths, attributes = svg2paths(svg_file_path)
            
            if not paths:
                raise ValueError("No paths found in SVG file")
                
            # Use the first path as the centerline
            centerline_path = paths[0]
            print(f"Found path with {len(centerline_path)} segments")
            
            # Sample points along the path
            points = []
            num_samples = 1000  # High resolution sampling
            
            for i in range(num_samples + 1):
                t = i / num_samples
                point = centerline_path.point(t)
                points.append((point.real, point.imag))
                
            self.centerline_points = points
            print(f"Extracted {len(points)} centerline points")
            return points
            
        except Exception as e:
            print(f"Error parsing SVG: {e}")
            raise
            
    def generate_track_borders(self):
        """
        Generate left and right track borders by offsetting the centerline.
        
        Returns:
            tuple: (left_border_points, right_border_points)
        """
        if not self.centerline_points:
            raise ValueError("No centerline points available. Parse SVG first.")
            
        print("Generating track borders...")
        
        # Convert to shapely LineString for easier manipulation
        centerline = LineString(self.centerline_points)
        
        # Calculate offset distance (half track width)
        offset_distance = self.track_width / 2
        
        # Generate offset lines
        try:
            left_offset = centerline.parallel_offset(offset_distance, 'left', join_style=2)
            right_offset = centerline.parallel_offset(offset_distance, 'right', join_style=2)
            
            # Extract coordinates
            if hasattr(left_offset, 'coords'):
                self.left_border_points = list(left_offset.coords)
            else:
                # Handle MultiLineString case
                self.left_border_points = []
                for geom in left_offset.geoms:
                    self.left_border_points.extend(list(geom.coords))
                    
            if hasattr(right_offset, 'coords'):
                self.right_border_points = list(right_offset.coords)
            else:
                # Handle MultiLineString case
                self.right_border_points = []
                for geom in right_offset.geoms:
                    self.right_border_points.extend(list(geom.coords))
                    
            print(f"Generated {len(self.left_border_points)} left border points")
            print(f"Generated {len(self.right_border_points)} right border points")
            
            return self.left_border_points, self.right_border_points
            
        except Exception as e:
            print(f"Error generating borders: {e}")
            # Fallback: manual offset calculation
            return self._manual_offset_calculation(offset_distance)
            
    def _manual_offset_calculation(self, offset_distance):
        """
        Fallback method for manual offset calculation.
        """
        print("Using manual offset calculation...")
        
        left_points = []
        right_points = []
        
        for i in range(len(self.centerline_points)):
            current = np.array(self.centerline_points[i])
            
            # Calculate direction vector
            if i == 0:
                next_point = np.array(self.centerline_points[i + 1])
                direction = next_point - current
            elif i == len(self.centerline_points) - 1:
                prev_point = np.array(self.centerline_points[i - 1])
                direction = current - prev_point
            else:
                prev_point = np.array(self.centerline_points[i - 1])
                next_point = np.array(self.centerline_points[i + 1])
                direction = next_point - prev_point
                
            # Normalize direction
            direction_norm = np.linalg.norm(direction)
            if direction_norm > 0:
                direction = direction / direction_norm
                
                # Calculate perpendicular vector (rotate 90 degrees)
                perpendicular = np.array([-direction[1], direction[0]])
                
                # Calculate offset points
                left_point = current + perpendicular * offset_distance
                right_point = current - perpendicular * offset_distance
                
                left_points.append(tuple(left_point))
                right_points.append(tuple(right_point))
                
        self.left_border_points = left_points
        self.right_border_points = right_points
        
        return left_points, right_points
        
    def divide_track_into_segments(self):
        """
        Divide the track into equally spaced segments along the centerline.
        
        Returns:
            list: Segment division points and their perpendicular lines
        """
        if not self.centerline_points:
            raise ValueError("No centerline points available. Parse SVG first.")
            
        print("Dividing track into segments...")
        
        # Calculate cumulative distances along centerline
        distances = [0]
        for i in range(1, len(self.centerline_points)):
            prev = np.array(self.centerline_points[i-1])
            curr = np.array(self.centerline_points[i])
            dist = np.linalg.norm(curr - prev)
            distances.append(distances[-1] + dist)
            
        total_length = distances[-1]
        num_segments = int(total_length / self.segment_length)
        
        print(f"Track length: {total_length:.2f} units")
        print(f"Creating {num_segments} segments of {self.segment_length} units each")
        
        # Find points at segment boundaries
        segment_divisions = []
        
        for i in range(num_segments + 1):
            target_distance = i * self.segment_length
            
            # Find the closest point on centerline
            for j in range(len(distances) - 1):
                if distances[j] <= target_distance <= distances[j + 1]:
                    # Interpolate between points j and j+1
                    t = (target_distance - distances[j]) / (distances[j + 1] - distances[j])
                    
                    p1 = np.array(self.centerline_points[j])
                    p2 = np.array(self.centerline_points[j + 1])
                    
                    # Interpolated point on centerline
                    center_point = p1 + t * (p2 - p1)
                    
                    # Calculate direction for perpendicular
                    direction = p2 - p1
                    direction_norm = np.linalg.norm(direction)
                    if direction_norm > 0:
                        direction = direction / direction_norm
                        perpendicular = np.array([-direction[1], direction[0]])
                        
                        # Create perpendicular line across track width
                        half_width = self.track_width / 2  # Match exactly with track borders
                        line_start = center_point - perpendicular * half_width
                        line_end = center_point + perpendicular * half_width
                        
                        segment_divisions.append({
                            'segment_number': i,
                            'center_point': tuple(center_point),
                            'line_start': tuple(line_start),
                            'line_end': tuple(line_end),
                            'distance': target_distance
                        })
                    break
        
        # Check if the track is closed (last point close to first point)
        if len(self.centerline_points) > 0:
            first_point = np.array(self.centerline_points[0])
            last_point = np.array(self.centerline_points[-1])
            distance_to_start = np.linalg.norm(last_point - first_point)
            
            # If the track is closed (distance < track_width, indicating a loop)
            if distance_to_start < self.track_width and len(segment_divisions) > 1:
                # Check distance between last segment and first segment
                if len(segment_divisions) >= 2:
                    last_segment = segment_divisions[-1]
                    first_segment = segment_divisions[0]
                    
                    last_center = np.array(last_segment['center_point'])
                    first_center = np.array(first_segment['center_point'])
                    
                    # Calculate distance between last and first segment
                    segment_distance = np.linalg.norm(last_center - first_center)
                    
                    # If the distance is less than the defined segment length, remove the last segment
                    if segment_distance < self.segment_length:
                        segment_divisions.pop()
                        print(f"Removed last segment due to insufficient distance to first segment")
                        print(f"Distance between last and first: {segment_distance:.2f} < {self.segment_length}")
        
        # Re-number segments after potential removal
        for i, segment in enumerate(segment_divisions):
            segment['segment_number'] = i + 1
                    
        self.segment_divisions = segment_divisions
        print(f"Created {len(segment_divisions)} segment divisions")
        
        return segment_divisions
        
    def plot_track(self, show_segments=True, figsize=(12, 8)):
        """
        Plot the generated track with borders and segments.
        
        Args:
            show_segments (bool): Whether to show segment divisions
            figsize (tuple): Figure size for the plot
        """
        fig, ax = plt.subplots(figsize=figsize)
        
        # Fill track area first (so it appears behind other elements)
        if self.left_border_points and self.right_border_points:
            # Create track polygon for filling
            track_points = self.left_border_points + self.right_border_points[::-1]
            track_polygon = Polygon(track_points, facecolor='black', 
                                  edgecolor='none', label='Track Surface')
            ax.add_patch(track_polygon)
            
        # Plot track borders
        if self.left_border_points:
            left_x, left_y = zip(*self.left_border_points)
            ax.plot(left_x, left_y, 'white', linewidth=3, label='Left Border')
            
        if self.right_border_points:
            right_x, right_y = zip(*self.right_border_points)
            ax.plot(right_x, right_y, 'white', linewidth=3, label='Right Border')
        
        # Plot centerline (dashed white)
        if self.centerline_points:
            centerline_x, centerline_y = zip(*self.centerline_points)
            ax.plot(centerline_x, centerline_y, 'white', linestyle='--', linewidth=2, 
                   label='Centerline')
            
        # Plot segment divisions
        if show_segments and self.segment_divisions:
            for segment in self.segment_divisions:
                start = segment['line_start']
                end = segment['line_end']
                ax.plot([start[0], end[0]], [start[1], end[1]], 'white', linewidth=1.5, alpha=0.9)
                
                # Add segment number
                # center = segment['center_point']
                # ax.text(center[0], center[1], str(segment['segment_number']), 
                #        fontsize=8, ha='center', va='center', color='white', weight='bold',
                #        bbox=dict(boxstyle='round,pad=0.2', facecolor='red', alpha=0.8))
                       
        ax.set_aspect('equal')
        ax.set_facecolor('darkgray')  # Dark background
        ax.grid(True, alpha=0.2, color='white')
        ax.legend(facecolor='white', edgecolor='black')
        ax.set_title('Heat: Pedal to the Metal - Race Track Generator', color='black')
        ax.set_xlabel('X coordinate', color='black')
        ax.set_ylabel('Y coordinate', color='black')
        
        plt.tight_layout()
        return fig, ax
        
    def save_plot(self, filename, dpi=300):
        """
        Save the current plot to file.
        
        Args:
            filename (str): Output filename
            dpi (int): Resolution for saved image
        """
        fig, ax = self.plot_track()
        fig.savefig(filename, dpi=dpi, bbox_inches='tight')
        plt.close(fig)
        print(f"Track saved to {filename}")

def create_sample_svg():
    """
    Create a sample SVG file for testing if none is provided.
    """
    sample_svg_content = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <path d="M 50 150 Q 100 50 200 100 Q 300 150 350 100 Q 380 80 350 200 Q 300 250 200 200 Q 100 250 50 150 Z" 
          stroke="black" stroke-width="2" fill="none"/>
</svg>'''
    
    with open('sample_track.svg', 'w') as f:
        f.write(sample_svg_content)
    print("Created sample SVG file: sample_track.svg")
    return 'sample_track.svg'

def main():
    """
    Main function to run the track generator.
    """
    parser = argparse.ArgumentParser(description='Generate Heat racetrack from SVG centerline')
    parser.add_argument('--svg', type=str, help='Path to SVG file with centerline')
    parser.add_argument('--width', type=float, default=200, help='Track width (default: 200)')
    parser.add_argument('--segment-length', type=float, default=400, help='Segment length (default: 400)')
    parser.add_argument('--output', type=str, default='track_output.png', help='Output filename')
    
    args = parser.parse_args()
    
    # Create sample SVG if none provided
    svg_file = args.svg
    if not svg_file or not os.path.exists(svg_file):
        print("No valid SVG file provided, creating sample...")
        svg_file = create_sample_svg()
    
    # Initialize generator
    generator = HeatTrackGenerator(track_width=args.width, segment_length=args.segment_length)
    
    try:
        # Step 1: Parse SVG centerline
        generator.parse_svg_centerline(svg_file)
        
        # Step 2: Generate track borders
        generator.generate_track_borders()
        
        # Step 3: Divide track into segments
        generator.divide_track_into_segments()
        
        # Plot and save results
        fig, ax = generator.plot_track()
        plt.show()
        
        # Save to file
        generator.save_plot(args.output)
        
        print(f"\nTrack generation completed!")
        print(f"- Track width: {args.width} units")
        print(f"- Segment length: {args.segment_length} units")
        print(f"- Number of segments: {len(generator.segment_divisions)}")
        print(f"- Output saved to: {args.output}")
        
    except Exception as e:
        print(f"Error: {e}")
        return 1
        
    return 0

if __name__ == "__main__":
    main()