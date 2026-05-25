CC = gcc
CFLAGS = -Wall -O3
LIBS = -lX11 -lXext

TARGET = x11-to-spi
SRC = x11-to-spi.c

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRC) $(LIBS)

clean:
	rm -f $(TARGET)
