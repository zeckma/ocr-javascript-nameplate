document.addEventListener('DOMContentLoaded', () => {
    const fileSelector = document.querySelector('input[type=file]');
    const startButton = document.getElementById('startButton');
    const progress = document.querySelector('.progress');
    const output = document.getElementById('output');
    const imageContainer = document.getElementById('imageContainer');

    //  file upload
    fileSelector.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const imgUrl = window.URL.createObjectURL(file);
            processImage(imgUrl);
        }
    });

    // for start button
    startButton.addEventListener('click', () => {
        const file = fileSelector.files[0];
        if (file) {
            const imgUrl = window.URL.createObjectURL(file);
            processImage(imgUrl);
        }
    });

    // Process the image with all additional steps
    function processImage(imgUrl) {
        progress.innerText = 'Processing...';

        applyBinarization(imgUrl)
            // .then(applySkewCorrection)
            // .then(applyNoiseRemoval)
            // .then(applyThinningAndSkeletonization)
            .then((processedImgUrl) => {
                displayImage(processedImgUrl);
                startOCR(processedImgUrl);
            })
            .catch((error) => {
                console.error('Error processing image:', error);
                progress.innerText = 'Error processing image';
            });
    }

    // Function to apply binarization
    function applyBinarization(imgUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0, img.width, img.height);

                // Preprocess image using threshold filter from the new program
                const processedImageData = preprocessImage(canvas);

                // Put processed image data back to canvas
                ctx.putImageData(processedImageData, 0, 0);

                // Convert canvas to URL
                const binarizedImgUrl = canvas.toDataURL();
                resolve(binarizedImgUrl);
            };
            img.src = imgUrl;
        });
    }

    // Function to preprocess image using threshold filter
    function preprocessImage(canvas) {
        const processedImageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        thresholdFilter(processedImageData.data, 0.5); // Set the threshold level to 0.5
        return processedImageData;
    }

    // Threshold filter function from the new program
    function thresholdFilter(pixels, level) {
        if (level === undefined) {
            level = 0.5;
        }
        const thresh = Math.floor(level * 255);
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            let val;
            if (gray >= thresh) {
                val = 255;
            } else {
                val = 0;
            }
            pixels[i] = pixels[i + 1] = pixels[i + 2] = val;
        }
    }

    // Function to apply Gaussian blur
    function applyGaussianBlur(canvas, radius) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        blurARGB(imageData.data, canvas, radius);
        ctx.putImageData(imageData, 0, 0);
    }

    // Function to display image
    function displayImage(imgUrl) {
        const imgElement = document.createElement('img');
        imgElement.src = imgUrl;
        imgElement.style.maxWidth = '50%';
        imageContainer.innerHTML = ''; // Clear previous image
        imageContainer.appendChild(imgElement);
    }

    // Function to start OCR process
    function startOCR(imgUrl) {
        progress.innerText = 'Performing OCR...';
        Tesseract.recognize(
            imgUrl,
            'eng',
            { logger: progressUpdate }
        ).then(({ data: { text } }) => {
            output.value = text;
            progress.innerText = 'OCR Complete';
        });
    }

    // Progress update function
    function progressUpdate(message) {
        if (message.status === 'recognizing text') {
            progress.innerText = `${message.status}: ${Math.round(message.progress * 100)}%`;
        } else {
            progress.innerText = message.status;
        }
    }

    // internal kernel stuff for the gaussian blur filter
    let blurRadius;
    let blurKernelSize;
    let blurKernel;
    let blurMult;

    // from https://github.com/processing/p5.js/blob/main/src/image/filters.js
    function buildBlurKernel(r) {
        let radius = (r * 3.5) | 0;
        radius = radius < 1 ? 1 : radius < 248 ? radius : 248;

        if (blurRadius !== radius) {
            blurRadius = radius;
            blurKernelSize = (1 + blurRadius) << 1;
            blurKernel = new Int32Array(blurKernelSize);
            blurMult = new Array(blurKernelSize);
            for (let l = 0; l < blurKernelSize; l++) {
                blurMult[l] = new Int32Array(256);
            }

            let bk, bki;
            let bm, bmi;

            for (let i = 1, radiusi = radius - 1; i < radius; i++) {
                blurKernel[radius + i] = blurKernel[radiusi] = bki = radiusi * radiusi;
                bm = blurMult[radius + i];
                bmi = blurMult[radiusi--];
                for (let j = 0; j < 256; j++) {
                    bm[j] = bmi[j] = bki * j;
                }
            }
            bk = blurKernel[radius] = radius * radius;
            bm = blurMult[radius];

            for (let k = 0; k < 256; k++) {
                bm[k] = bk * k;
            }
        }
    }

    // from https://github.com/processing/p5.js/blob/main/src/image/filters.js
    function blurARGB(pixels, canvas, radius) {
        const width = canvas.width;
        const height = canvas.height;
        const numPackedPixels = width * height;
        const argb = new Int32Array(numPackedPixels);
        for (let j = 0; j < numPackedPixels; j++) {
            argb[j] = getARGB(pixels, j);
        }
        let sum, cr, cg, cb, ca;
        let read, ri, ym, ymi, bk0;
        const a2 = new Int32Array(numPackedPixels);
        const r2 = new Int32Array(numPackedPixels);
        const g2 = new Int32Array(numPackedPixels);
        const b2 = new Int32Array(numPackedPixels);
        let yi = 0;
        buildBlurKernel(radius);
        let x, y, i;
        let bm;
        for (y = 0; y < height; y++) {
            for (x = 0; x < width; x++) {
                cb = cg = cr = ca = sum = 0;
                read = x - blurRadius;
                if (read < 0) {
                    bk0 = -read;
                    read = 0;
                } else {
                    if (read >= width) {
                        break;
                    }
                    bk0 = 0;
                }
                for (i = bk0; i < blurKernelSize; i++) {
                    if (read >= width) {
                        break;
                    }
                    const c = argb[read + yi];
                    bm = blurMult[i];
                    ca += bm[(c & -16777216) >>> 24];
                    cr += bm[(c & 16711680) >> 16];
                    cg += bm[(c & 65280) >> 8];
                    cb += bm[c & 255];
                    sum += blurKernel[i];
                    read++;
                }
                ri = yi + x;
                a2[ri] = ca / sum;
                r2[ri] = cr / sum;
                g2[ri] = cg / sum;
                b2[ri] = cb / sum;
            }
            yi += width;
        }
        yi = 0;
        ym = -blurRadius;
        ymi = ym * width;
        for (y = 0; y < height; y++) {
            for (x = 0; x < width; x++) {
                cb = cg = cr = ca = sum = 0;
                if (ym < 0) {
                    bk0 = ri = -ym;
                    read = x;
                } else {
                    if (ym >= height) {
                        break;
                    }
                    bk0 = 0;
                    ri = ym;
                    read = x + ymi;
                }
                for (i = bk0; i < blurKernelSize; i++) {
                    if (ri >= height) {
                        break;
                    }
                    bm = blurMult[i];
                    ca += bm[a2[read]];
                    cr += bm[r2[read]];
                    cg += bm[g2[read]];
                    cb += bm[b2[read]];
                    sum += blurKernel[i];
                    ri++;
                    read += width;
                }
                argb[x + yi] =
                    ((ca / sum) << 24) |
                    ((cr / sum) << 16) |
                    ((cg / sum) << 8) |
                    (cb / sum);
            }
            yi += width;
            ymi += width;
            ym++;
        }
        setPixels(pixels, argb);
    }

    // Function to get ARGB values from pixel data
    function getARGB(data, i) {
        const offset = i * 4;
        return (
            ((data[offset + 3] << 24) & 0xff000000) |
            ((data[offset] << 16) & 0x00ff0000) |
            ((data[offset + 1] << 8) & 0x0000ff00) |
            (data[offset + 2] & 0x000000ff)
        );
    }

    // Function to set pixel data from ARGB values
    function setPixels(pixels, data) {
        let offset = 0;
        for (let i = 0, al = pixels.length; i < al; i++) {
            offset = i * 4;
            pixels[offset + 0] = (data[i] & 0x00ff0000) >>> 16;
            pixels[offset + 1] = (data[i] & 0x0000ff00) >>> 8;
            pixels[offset + 2] = data[i] & 0x000000ff;
            pixels[offset + 3] = (data[i] & 0xff000000) >>> 24;
        }
    }
});

