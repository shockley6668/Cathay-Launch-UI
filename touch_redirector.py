import time
import subprocess
import gt911

def main():
    print("Starting GT911 Touch Redirector for RDK X5...")
    
    # Initialize the GT911 touch chip
    # (Sets address to 0x5D using RST pin 17 and INT pin 4)
    touch = gt911.gt911()
    
    print("Touch redirector active. Waiting for touch events...")
    
    try:
        while True:
            time.sleep(0.05) # 50ms polling interval for responsive touch response
            
            if touch.last_x != -1 and touch.last_y != -1:
                # Map coordinates for landscape mode (480x320) by rotating 90 degrees
                x_out = 480 - touch.last_y
                y_out = touch.last_x
                
                if 0 <= x_out <= 480 and 0 <= y_out <= 320:
                    print(f"Touch detected at LCD: ({touch.last_x}, {touch.last_y}) -> Landscape: ({x_out}, {y_out})")
                    # Inject mouse move and click on display :0 at (x_out, y_out)
                    cmd = f"DISPLAY=:0 xdotool mousemove {x_out} {y_out} click 1"
                    subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                # Reset coordinates to prevent repeating clicks
                touch.last_x = -1
                touch.last_y = -1
                
    except KeyboardInterrupt:
        print("Stopping Touch Redirector...")

if __name__ == '__main__':
    main()
