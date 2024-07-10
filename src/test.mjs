import Excel from "exceljs";
import ExcelJSWriter from "ocx/src/workbook/exceljs-writer";

// import OCX from "ocx/src/index";
import OCFPackage from "ocx/src/ocf-package";
import Model from "ocx/src/model";
// import Logger from "ocx/src/logging";
import * as fs from "fs";
import path from "path";

function adaptEntryToFileInterface(basepath, entry) {
    const fullpath = path.join(basepath, entry.name);

    return {
        path: fullpath,
        isSameAs: (containerRelativePath) => path.resolve(fullpath) === path.resolve(path.join(basepath, containerRelativePath)),
        sizeInBytes: fs.statSync(fullpath).size,
        readAsText: () => fs.readFileSync(fullpath, "utf8"),
    };
}

function adaptToFileInterface(basepath) {
    return (entry) => adaptEntryToFileInterface(basepath, entry);
}

function isFile(entry) {
    return entry.isFile();
}

function extractFilesetFromDirectory(path) {
    const allEntries = fs.readdirSync(path, { withFileTypes: true });

    return allEntries.filter(isFile).map(adaptToFileInterface(path));
}

function extractFilesetFromPath(path) {
    const fsInfo = fs.statSync(path);

    if (fsInfo.isDirectory()) {
        return extractFilesetFromDirectory(path);
    }

    return []; // no other methods supported yet
}

// import * as pipeline from "ocx/src/cli/pipeline-steps";
function exportOCX(src) {
    try {
        console.log(`* Searching ${src} for a manifest file`);
        const files = extractFilesetFromPath(src);
        const ocfpkg = OCFPackage.createFromFileset(files);
        console.log("- Found OCF Manifest File", ocfpkg.manifestFile.path);

        const model = new Model(ocfpkg.asOfDate, ocfpkg.generatedAtTimestamp);
        console.log("  Effective Date: ", model.asOfDate.toLocaleDateString());

        for (const object of ocfpkg) {
            model.consume(object);
        }

        const workbook = new Excel.Workbook();
        new Workbook(new ExcelJSWriter(workbook), model);

        // const buffer = workbook.xlsx.writeBuffer();
        // const buffer = workbook.xlsx.writeBuffer()
        // return buffer;
        writeFile("ocf2ocx.xlsx").then(() => {
            console.log("wrote to ocf2ocx.xlsx");
        });
    } catch (e) {
        if (e instanceof Error) {
            console.log(e.stack || e.message);
            console.error(e.stack || e.message);
        } else {
            console.error("Unknown error occurred.");
        }
        // process.exit(1);
    }
}

exportOCX("./dextego").then(console.log).catch(console.error);
