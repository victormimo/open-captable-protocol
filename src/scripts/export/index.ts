import Excel from "exceljs";
import ExcelJSWriter from "./workbook/exceljs-writer";

import OCFPackage from "./ocf-package";
import Model from "./model";
import Logger from "./logging";
import Workbook from "./workbook";

export async function exportManifestToOCX(manifestFiles) {
    try {
        const ocfpkg = OCFPackage.createFromFileset(manifestFiles);

        const model = new Model(new Date(), new Date());

        for (const object of ocfpkg.objects()) {
            model.consume(object);
        }

        const workbook = new Excel.Workbook();
        new Workbook(new ExcelJSWriter(workbook), model);
        return workbook.xlsx;
    } catch (e: unknown) {
        if (e instanceof Error) {
            Logger.error(e.stack || e.message);
        } else {
            Logger.error("Unknown error occurred.");
        }
    }
}
