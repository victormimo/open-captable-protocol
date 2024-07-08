import Busboy from "busboy";
import yauzl from "yauzl";

const processManifest = (req) => {
    return new Promise((resolve, reject) => {
        const arr = [];
        const busboy = Busboy({ headers: req.headers });

        busboy.on("file", (_, file, filename) => {
            const chunks = [];
            file.on("data", (data) => {
                chunks.push(data);
            });

            file.on("end", () => {
                try {
                    const fileBuffer = Buffer.concat(chunks);
                    yauzl.fromBuffer(fileBuffer, { lazyEntries: true }, (err, zipfile) => {
                        if (err) return reject(new Error(`Error opening zip file: ${err.message}`));

                        zipfile.readEntry();
                        zipfile.on("entry", (entry) => {
                            if (/\/$/.test(entry.fileName)) {
                                zipfile.readEntry();
                            } else {
                                zipfile.openReadStream(entry, (err, readStream) => {
                                    if (err) return reject(new Error(`Error reading zip entry: ${err.message}`));

                                    const chunks = [];
                                    readStream.on("data", (chunk) => {
                                        chunks.push(chunk);
                                    });

                                    readStream.on("end", () => {
                                        try {
                                            const fileData = Buffer.concat(chunks);
                                            if (fileData.length === 0) {
                                                console.error("Empty file detected:", entry.fileName);
                                            } else if (entry.fileName.endsWith("ocf.json")) {
                                                arr.push(JSON.parse(fileData.toString()));
                                            }
                                            zipfile.readEntry();
                                        } catch (parseError) {
                                            reject(new Error(`Error parsing file data: ${parseError.message}`));
                                        }
                                    });

                                    readStream.on("error", (error) => {
                                        reject(new Error(`Error reading stream: ${error.message}`));
                                    });
                                });
                            }
                        });

                        zipfile.on("end", () => {
                            resolve(arr);
                        });

                        zipfile.on("error", (zipError) => {
                            reject(new Error(`Zip file error: ${zipError.message}`));
                        });
                    });
                } catch (bufferError) {
                    reject(new Error(`Error processing file buffer: ${bufferError.message}`));
                }
            });

            file.on("error", (fileError) => {
                reject(new Error(`File stream error: ${fileError.message}`));
            });
        });

        busboy.on("error", (err) => {
            reject(new Error(`Busboy error: ${err.message}`));
        });

        req.pipe(busboy);
    });
};

export default processManifest;
