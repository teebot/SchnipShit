const tessel = require('tessel');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const av = require('tessel-av');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const camera = new av.Camera();

const app = express();
const CAPTURES_PATH = path.join(__dirname, 'captures');
const CAPTURES_STORAGE_PATH = path.join(__dirname, 'captures.json');
ensureDir(CAPTURES_PATH);
ensureStoredCaptures(CAPTURES_STORAGE_PATH);

app.use(bodyParser.json());
app.use('/captures', express.static(CAPTURES_PATH));

app.get('/', (req, res) =>
  getStoredCaptures(CAPTURES_STORAGE_PATH).then(captures => {
    res.send(renderHtml(captures.items));
  })
);

app.post('/jiraShipped', (req, res) => {
  const payload = req.body;
  console.log(payload);

  if (!validPayload(payload)) {
    res.status(500).send('Invalid Payload');
    return;
  }

  const capture = camera.capture();
  capture.on('data', imgData => {
    const timeStamp = Date.now();
    const fileName = `${timeStamp}.jpg`;
    const imgPath = path.join(CAPTURES_PATH, fileName);

    fs.writeFileAsync(imgPath, imgData).then(_ => {
      console.log('Captured image');
      return getStoredCaptures(CAPTURES_STORAGE_PATH);
    }).then(data => {
      data.items.push({fileName, timeStamp, overlay: payload.description, key: payload.key});
      return saveStoredCaptures(CAPTURES_STORAGE_PATH, data);
    }).catch((err) => {
      console.log(err);
      res.status(500).send('Could not store image');
    });

    console.log(`Writing image at ${imgPath}`);
    res.send('OK');
  });

  capture.on('error', (error) => {
    console.error(error);
    res.status(500).send('Capturing picture failed');
  });
});

const PORT = 8082;
app.listen(PORT, () =>
  console.log(`Server running at ${PORT}`)
);


function ensureDir(path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }
}

function ensureStoredCaptures(path) {
  if (!fs.existsSync(path)) {
    return fs.writeFileSync(path, JSON.stringify({items: []}));
  }
}

function getStoredCaptures(path) {
  return fs.readFileAsync(path, 'utf8').then(data => {
    try {
      return JSON.parse(data);
    }
    catch (e) {
      console.error('Could not parse JSON')
      return {};
    }
  });
}

function saveStoredCaptures(path, data) {
  // remove items older than 10 days
  data.items = data.items.filter(i => i.timeStamp > daysAgoTimeStamp(10));

  return fs.writeFileAsync(path, JSON.stringify(data)).then(_ => data);
}


function renderHtml(capturePaths) {
  const capturesHTML = capturePaths.reduce((acc, cp) => {
    acc += `
        <div class="capture">
            <div class="overlay">${cp.overlay}</div>
            <div class="timestamp">${new Date(cp.timeStamp).toString()}</div>
            <div class="key">${cp.key}</div>
            <img src="/captures/${cp.fileName}" />
        </div>
    `;
    return acc;
  }, '');


  return `
    <html>
        <head>
            <title>Schnip Shit</title>
            <style>
                body {
                    font-family: sans-serif;
                    background: #000;
                    background-image: url(https://www.drupal.org/files/x-all-the-things-template.png);
                }
                
                .capture {
                    position: relative;
                    margin: 5px;
                    color: #FFF;
                    max-width: 50%;
                    margin: 100px auto;
                }
                
                .capture img {
                    width: 100%;
                }
                
                .overlay {
                    position: absolute;
                    bottom: 6px;
                    left: 6px;
                    font-size: 92px;
                    text-shadow: -4px 0 black, 0 4px black, 4px 0 black, 0 -4px black;
                }
                
                .key {
                    position: absolute;
                    top: 6px;
                    left: 6px;
                    font-size: 42px;
                    text-shadow: -3px 0 black, 0 3px black, 3px 0 black, 0 -3px black;
                }
                
                .timestamp {
                    position: absolute;
                    top: 6px;
                    right: 6px;
                    font-size: 12px;
                    text-shadow: -1px 0 black, 0 1px black, 1px 0 black, 0 -1px black;
                }
            </style>
        </head>
        <body>
            <div class="container">
                ${capturesHTML}
            </div>
        <script>
            const captures = document.querySelectorAll('.capture');
            let i = 0;
            if (captures.length) {
              captures.forEach((c) => c.style.display = 'none');
              setInterval(() => {
                captures.forEach((c) => c.style.display = 'none');
                captures[i].style.display = 'block';
                i++;
                if (i === captures.length) {
                  i = 0;
                }  
              }, 2000);
            }
            
            setTimeout(() => {
              window.location.reload();
            }, 60000);
        </script>
        
        
        </body>
    </html>
  `;
}

function validPayload(payload) {
  return payload && payload.key && payload.description;
}

function daysAgoTimeStamp(days) {
  return Date.now() - days * 24 * 3600 * 1000;
}
