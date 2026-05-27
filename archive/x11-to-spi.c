#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/spi/spidev.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <time.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <X11/extensions/XShm.h>

#define SPI_DEVICE "/dev/spidev1.1"
#define SPI_SPEED  40000000 // 40MHz
#define SPI_MODE   0

#define DC_PIN     388 // BCM 22, Physical Pin 15
#define RST_PIN    379 // BCM 27, Physical Pin 13
#define BL_PIN     421 // BCM 18, Physical Pin 12

#define WIDTH      480
#define HEIGHT     320

int dc_fd = -1;
int rst_fd = -1;
int bl_fd = -1;
int spi_fd = -1;

void init_gpio_pin(int pin) {
    char path[128];
    sprintf(path, "/sys/class/gpio/gpio%d", pin);
    if (access(path, F_OK) == -1) {
        int fd = open("/sys/class/gpio/export", O_WRONLY);
        if (fd != -1) {
            char buf[32];
            sprintf(buf, "%d", pin);
            write(fd, buf, strlen(buf));
            close(fd);
            usleep(100000); // wait for udev
        }
    }
    
    sprintf(path, "/sys/class/gpio/gpio%d/direction", pin);
    int fd = open(path, O_WRONLY);
    if (fd != -1) {
        write(fd, "out", 3);
        close(fd);
    }
}

int open_gpio_value_fd(int pin) {
    char path[128];
    sprintf(path, "/sys/class/gpio/gpio%d/value", pin);
    int fd = open(path, O_RDWR);
    if (fd == -1) {
        perror("Failed to open GPIO value fd");
    }
    return fd;
}

void gpio_write(int fd, int value) {
    if (fd != -1) {
        lseek(fd, 0, SEEK_SET);
        if (value) {
            write(fd, "1", 1);
        } else {
            write(fd, "0", 1);
        }
    }
}

void write_command(uint8_t cmd) {
    gpio_write(dc_fd, 0); // DC low for command
    usleep(5); // Wait for DC pin to settle
    struct spi_ioc_transfer tr = {
        .tx_buf = (unsigned long)&cmd,
        .len = 1,
        .speed_hz = SPI_SPEED,
        .bits_per_word = 8,
    };
    ioctl(spi_fd, SPI_IOC_MESSAGE(1), &tr);
    usleep(5); // Wait for SPI FIFO to flush
}

void write_data(uint8_t data) {
    gpio_write(dc_fd, 1); // DC high for data
    usleep(5); // Wait for DC pin to settle
    struct spi_ioc_transfer tr = {
        .tx_buf = (unsigned long)&data,
        .len = 1,
        .speed_hz = SPI_SPEED,
        .bits_per_word = 8,
    };
    ioctl(spi_fd, SPI_IOC_MESSAGE(1), &tr);
    usleep(5); // Wait for SPI FIFO to flush
}

void write_data_buf(uint8_t *buf, size_t len) {
    gpio_write(dc_fd, 1); // DC high for data
    usleep(10); // Wait slightly longer before large transfer
    size_t chunk_size = 524288; // Optimized SPI buffer size (configured in /etc/modprobe.d/spidev.conf)
    for (size_t i = 0; i < len; i += chunk_size) {
        size_t size = (len - i < chunk_size) ? len - i : chunk_size;
        struct spi_ioc_transfer tr = {
            .tx_buf = (unsigned long)(buf + i),
            .len = size,
            .speed_hz = SPI_SPEED,
            .bits_per_word = 8,
        };
        if (ioctl(spi_fd, SPI_IOC_MESSAGE(1), &tr) < 0) {
            perror("SPI transfer failed");
            break;
        }
    }
    usleep(1000); // CRITICAL: Wait 1ms to ensure SPI DMA and hardware FIFO are fully drained before next DC change!
}

void reset_display() {
    gpio_write(rst_fd, 1);
    usleep(10000);
    gpio_write(rst_fd, 0);
    usleep(10000);
    gpio_write(rst_fd, 1);
    usleep(10000);
}

void lcd_init() {
    reset_display();
    
    write_command(0x11); // Sleep Out
    usleep(120000);
    
    write_command(0x36); // Memory Access Control
    write_data(0xE8);    // Landscape mode (MY=1, MX=1, MV=1, ML=0, BGR=1)
    
    write_command(0x3A); // Pixel Interface Format
    write_data(0x05);    // 16 bits/pixel (RGB565)
    
    write_command(0xF0); // Command Set Control
    write_data(0xC3);
    
    write_command(0xF0);
    write_data(0x96);
    
    write_command(0xB4); // Display Inversion Control
    write_data(0x01);    // 1-dot inversion
    
    write_command(0xB7); // Entry Mode Set
    write_data(0xC6);
    
    write_command(0xC0); // Power Control 1
    write_data(0x80);
    write_data(0x45);
    
    write_command(0xC1); // Power Control 2
    write_data(0x13);
    
    write_command(0xC2); // Power Control 3
    write_data(0xA7);
    
    write_command(0xC5); // VCOM Control
    write_data(0x0A);
    
    write_command(0xE8); // Display Output Timing Control
    write_data(0x40); write_data(0x8A); write_data(0x00); write_data(0x00);
    write_data(0x29); write_data(0x19); write_data(0xA5); write_data(0x33);
    
    // Positive Gamma Control
    write_command(0xE0);
    uint8_t pos_gamma[] = {0xD0, 0x08, 0x0F, 0x06, 0x06, 0x33, 0x30, 0x33, 0x47, 0x17, 0x13, 0x13, 0x2B, 0x31};
    for (int i = 0; i < 14; i++) write_data(pos_gamma[i]);
    
    // Negative Gamma Control
    write_command(0xE1);
    uint8_t neg_gamma[] = {0xD0, 0x0A, 0x11, 0x0B, 0x09, 0x07, 0x2F, 0x33, 0x47, 0x38, 0x15, 0x16, 0x2C, 0x32};
    for (int i = 0; i < 14; i++) write_data(neg_gamma[i]);
    
    write_command(0xF0);
    write_data(0x3C);
    
    write_command(0xF0);
    write_data(0x69);
    
    write_command(0x21); // Display Inversion On
    write_command(0x11); // Sleep Out
    usleep(100000);
    write_command(0x29); // Display On
}

void set_windows(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1) {
    write_command(0x2A); // Column Address Set
    write_data(x0 >> 8);
    write_data(x0 & 0xFF);
    write_data(x1 >> 8);
    write_data(x1 & 0xFF);
    
    write_command(0x2B); // Page Address Set
    write_data(y0 >> 8);
    write_data(y0 & 0xFF);
    write_data(y1 >> 8);
    write_data(y1 & 0xFF);
    
    write_command(0x2C); // Memory Write
}

int main(int argc, char **argv) {
    // 1. Initialize GPIOs
    init_gpio_pin(DC_PIN);
    init_gpio_pin(RST_PIN);
    init_gpio_pin(BL_PIN);
    
    dc_fd = open_gpio_value_fd(DC_PIN);
    rst_fd = open_gpio_value_fd(RST_PIN);
    bl_fd = open_gpio_value_fd(BL_PIN);
    
    // Turn on Backlight
    gpio_write(bl_fd, 1);
    
    // 2. Initialize SPI
    spi_fd = open(SPI_DEVICE, O_RDWR);
    if (spi_fd < 0) {
        perror("Failed to open SPI device");
        return 1;
    }
    
    uint8_t mode = SPI_MODE;
    uint8_t bits = 8;
    uint32_t speed = SPI_SPEED;
    
    if (ioctl(spi_fd, SPI_IOC_WR_MODE, &mode) < 0) perror("SPI mode WR failed");
    if (ioctl(spi_fd, SPI_IOC_WR_BITS_PER_WORD, &bits) < 0) perror("SPI bits WR failed");
    if (ioctl(spi_fd, SPI_IOC_WR_MAX_SPEED_HZ, &speed) < 0) perror("SPI speed WR failed");
    
    // 3. Initialize LCD
    printf("Initializing LCD ST7796S...\n");
    lcd_init();
    printf("LCD Initialized.\n");
    
    set_windows(0, 0, WIDTH - 1, HEIGHT - 1);
    
    // 4. Initialize X11 Display
    Display *display = XOpenDisplay(":0");
    if (!display) {
        fprintf(stderr, "Cannot open X11 display :0\n");
        return 1;
    }
    
    Window root = DefaultRootWindow(display);
    XWindowAttributes gwa;
    XGetWindowAttributes(display, root, &gwa);
    printf("X11 Root Window resolution: %dx%d\n", gwa.width, gwa.height);
    
    uint8_t *frame_buffer = malloc(WIDTH * HEIGHT * 2);
    if (!frame_buffer) {
        fprintf(stderr, "Failed to allocate framebuffer memory\n");
        return 1;
    }
    
    uint8_t *prev_frame_buffer = malloc(WIDTH * HEIGHT * 2);
    if (!prev_frame_buffer) {
        fprintf(stderr, "Failed to allocate prev_framebuffer memory\n");
        free(frame_buffer);
        return 1;
    }
    memset(prev_frame_buffer, 0, WIDTH * HEIGHT * 2);
    
    // 5. Initialize X11 SHM Extension
    int shm_active = 0;
    XShmSegmentInfo shminfo;
    XImage *shm_image = NULL;
    
    if (XShmQueryExtension(display)) {
        printf("X11 SHM Extension supported. Allocating shared memory...\n");
        shm_image = XShmCreateImage(display, DefaultVisual(display, DefaultScreen(display)),
                                     gwa.depth, ZPixmap, NULL, &shminfo, WIDTH, HEIGHT);
        if (shm_image) {
            shminfo.shmid = shmget(IPC_PRIVATE, shm_image->bytes_per_line * shm_image->height, IPC_CREAT | 0777);
            if (shminfo.shmid != -1) {
                shminfo.shmaddr = shm_image->data = shmat(shminfo.shmid, 0, 0);
                if (shminfo.shmaddr != (char *)-1) {
                    shminfo.readOnly = False;
                    if (XShmAttach(display, &shminfo)) {
                        shm_active = 1;
                        printf("X11 SHM initialized successfully.\n");
                    } else {
                        fprintf(stderr, "XShmAttach failed\n");
                        shmdt(shminfo.shmaddr);
                        shmctl(shminfo.shmid, IPC_RMID, 0);
                        XDestroyImage(shm_image);
                        shm_image = NULL;
                    }
                } else {
                    perror("shmat failed");
                    shmctl(shminfo.shmid, IPC_RMID, 0);
                    XDestroyImage(shm_image);
                    shm_image = NULL;
                }
            } else {
                perror("shmget failed");
                XDestroyImage(shm_image);
                shm_image = NULL;
            }
        } else {
            fprintf(stderr, "XShmCreateImage failed\n");
        }
    } else {
        printf("X11 SHM Extension NOT supported. Using slow fallback.\n");
    }
    
    // Clear screen once with black to avoid garbage on startup
    set_windows(0, 0, WIDTH - 1, HEIGHT - 1);
    write_command(0x2C);
    write_data_buf(prev_frame_buffer, WIDTH * HEIGHT * 2);
    
    printf("Starting X11 to SPI capture loop (Press Ctrl+C to stop)...\n");
    
    // Performance measurement variables
    struct timespec start_time, after_get, after_convert, after_spi, end_time;
    long long elapsed_ns;
    long long target_ns = 33333333; // 33.3ms for 30fps
    
    int frame_count = 0;
    double sum_get_ms = 0;
    double sum_conv_ms = 0;
    double sum_spi_ms = 0;
    long long total_pixels_sent = 0;
    
    while (1) {
        clock_gettime(CLOCK_MONOTONIC, &start_time);
        
        XImage *ximage = NULL;
        int is_fallback = 0;
        
        // Capture screen
        if (shm_active) {
            if (XShmGetImage(display, root, shm_image, 0, 0, AllPlanes)) {
                ximage = shm_image;
            } else {
                fprintf(stderr, "XShmGetImage failed, falling back\n");
                ximage = XGetImage(display, root, 0, 0, WIDTH, HEIGHT, AllPlanes, ZPixmap);
                is_fallback = 1;
            }
        } else {
            ximage = XGetImage(display, root, 0, 0, WIDTH, HEIGHT, AllPlanes, ZPixmap);
            is_fallback = 1;
        }
        
        clock_gettime(CLOCK_MONOTONIC, &after_get);
        
        if (ximage) {
            // High-speed pixel conversion: BGRA to RGB565 big endian
            uint8_t *src = (uint8_t *)ximage->data;
            int bytes_per_line = ximage->bytes_per_line;
            int depth = ximage->bits_per_pixel;
            
            if (depth == 32) {
                for (int y = 0; y < HEIGHT; y++) {
                    uint8_t *line_src = src + y * bytes_per_line;
                    uint8_t *dest = frame_buffer + y * WIDTH * 2;
                    for (int x = 0; x < WIDTH; x++) {
                        uint8_t b = line_src[x * 4 + 0];
                        uint8_t g = line_src[x * 4 + 1];
                        uint8_t r = line_src[x * 4 + 2];
                        
                        dest[x * 2 + 0] = (r & 0xF8) | (g >> 5);
                        dest[x * 2 + 1] = ((g & 0x1C) << 3) | (b >> 3);
                    }
                }
            } else {
                for (int y = 0; y < HEIGHT; y++) {
                    uint8_t *dest = frame_buffer + y * WIDTH * 2;
                    for (int x = 0; x < WIDTH; x++) {
                        unsigned long pixel = XGetPixel(ximage, x, y);
                        uint8_t r = (pixel & 0xFF0000) >> 16;
                        uint8_t g = (pixel & 0x00FF00) >> 8;
                        uint8_t b = (pixel & 0x0000FF);
                        
                        dest[x * 2 + 0] = (r & 0xF8) | (g >> 5);
                        dest[x * 2 + 1] = ((g & 0x1C) << 3) | (b >> 3);
                    }
                }
            }
            
            clock_gettime(CLOCK_MONOTONIC, &after_convert);
            
            if (is_fallback) {
                XDestroyImage(ximage);
            }
            
            // --- Static Frame Bypass (Full Frame, No DC Toggle) ---
            int changed = 0;
            uint16_t *curr_16 = (uint16_t *)frame_buffer;
            uint16_t *prev_16 = (uint16_t *)prev_frame_buffer;
            
            for (int i = 0; i < WIDTH * HEIGHT; i++) {
                if (curr_16[i] != prev_16[i]) {
                    changed = 1;
                    break;
                }
            }
            
            double spi_ms = 0.0;
            if (changed) {
                // Do NOT call set_windows or 0x2C here! 
                // The ST7796S RAM pointer auto-wraps to (0,0) after a full screen write.
                // By never pulling DC low (never sending commands), we 100% eliminate the risk 
                // of SPI data being interpreted as commands due to DC toggle timing!
                write_data_buf(frame_buffer, WIDTH * HEIGHT * 2);
                
                memcpy(prev_frame_buffer, frame_buffer, WIDTH * HEIGHT * 2);
                total_pixels_sent += (WIDTH * HEIGHT);
            }
            
            clock_gettime(CLOCK_MONOTONIC, &after_spi);
            
            // Stats calculation
            double get_ms = (after_get.tv_sec - start_time.tv_sec) * 1000.0 + (after_get.tv_nsec - start_time.tv_nsec) / 1000000.0;
            double conv_ms = (after_convert.tv_sec - after_get.tv_sec) * 1000.0 + (after_convert.tv_nsec - after_get.tv_nsec) / 1000000.0;
            spi_ms = (after_spi.tv_sec - after_convert.tv_sec) * 1000.0 + (after_spi.tv_nsec - after_convert.tv_nsec) / 1000000.0;
            
            sum_get_ms += get_ms;
            sum_conv_ms += conv_ms;
            sum_spi_ms += spi_ms;
            
            frame_count++;
            if (frame_count >= 100) {
                double total_time_ms = sum_get_ms + sum_conv_ms + sum_spi_ms;
                double avg_pixels = (double)total_pixels_sent / frame_count;
                double change_pct = (avg_pixels / (WIDTH * HEIGHT)) * 100.0;
                printf("[FPS Stats] FPS: %.1f | Grab: %.1fms | Conv: %.1fms | SPI: %.1fms | Total: %.1fms | Area: %.1f%% (%d px)\n",
                       1000.0 / (total_time_ms / frame_count),
                       sum_get_ms / frame_count,
                       sum_conv_ms / frame_count,
                       sum_spi_ms / frame_count,
                       total_time_ms / frame_count,
                       change_pct, (int)avg_pixels);
                fflush(stdout);
                frame_count = 0;
                sum_get_ms = 0;
                sum_conv_ms = 0;
                sum_spi_ms = 0;
                total_pixels_sent = 0;
            }
        } else {
            fprintf(stderr, "Failed to capture XImage\n");
        }
        
        clock_gettime(CLOCK_MONOTONIC, &end_time);
        elapsed_ns = (end_time.tv_sec - start_time.tv_sec) * 1000000000LL + (end_time.tv_nsec - start_time.tv_nsec);
        
        if (elapsed_ns < target_ns) {
            usleep((target_ns - elapsed_ns) / 1000);
        }
    }
    
    // Cleanup
    if (shm_active) {
        XShmDetach(display, &shminfo);
        XDestroyImage(shm_image);
        shmdt(shminfo.shmaddr);
        shmctl(shminfo.shmid, IPC_RMID, 0);
    }
    
    free(frame_buffer);
    free(prev_frame_buffer);
    close(spi_fd);
    close(dc_fd);
    close(rst_fd);
    close(bl_fd);
    XCloseDisplay(display);
    return 0;
}
