import Logger from "./logging";

interface File {
    readonly path: string;
    readonly isSameAs: (containerRelativePath: string) => boolean;
    readonly sizeInBytes: number;
    // readonly readAsText: () => string;
}

interface OCFObject {
    readonly id: string;
    readonly object_type: string; // this is actually an enum that comes from the schema but we'll stick with string for now
}

interface ReferencedFile {
    readonly filepath: string;
}
import Busboy from "busboy";
import yauzl from "yauzl";

// export default processManifest;

// This user-defined type guard may seem redundant with the interface
// definition above, but it is what allows us to "know" that
// OCFPackage.*objects() generates only OCFObjects and never anything
// else.
//
// It by definition has to allow the arg to be of type "any" so we
// allow that to bypass the eslint rules here.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isOCFObject(arg: any): arg is OCFObject {
    return arg && typeof arg == "object" && arg.id && typeof arg.id == "string" && arg.object_type && typeof arg.object_type == "string";
}

class OCFPackage {
    // This probably isn't the right way to define new error types
    // but it got the job done quickly.
    static NoManifestFound = new Error("No manifest file found");
    static MultipleManifestFilesFound = new Error("Multiple manifest files found");

    public static createFromFileset(files: File[]): OCFPackage {
        // console.log("Starting to filter files...");

        const jsonFiles = files.filter((file) => {
            const result = this.isDotJson(file);
            console.log(`File ${file.path} is JSON: ${result}`);
            return result;
        });

        // const sizeLimitedFiles = jsonFiles.filter((file) => {
        //     const result = this.underManifestSizeLimit(file);
        //     console.log(`File ${file.path} is under manifest size limit: ${result}`);
        //     return result;
        // });

        const candidateFiles = jsonFiles.filter((file) => {
            const result = this.couldBeManifestFile(file);
            console.log(`File ${file.path} could be manifest file: ${result}`);
            return result;
        });

        // console.log("Finished filtering files. Candidate files:", candidateFiles);

        if (candidateFiles.length == 0) {
            throw this.NoManifestFound;
        }

        if (candidateFiles.length > 1) {
            throw this.MultipleManifestFilesFound;
        }

        return new OCFPackage(candidateFiles[0], files);
    }

    readonly asOfDate: Date;
    readonly generatedAtTimestamp: Date;

    public *objects(): Generator<OCFObject> {
        // first the issuer from the manifest
        const parsedManifest = this.manifestFile;
        if (isOCFObject(parsedManifest.issuer)) {
            yield parsedManifest.issuer;
        } else {
            Logger.warn("Encountered non-OCF object");
        }

        yield* this.itemsIn(parsedManifest?.stakeholders_files as ReferencedFile[]);
        yield* this.itemsIn(parsedManifest?.stock_classes_files as ReferencedFile[]);
        yield* this.itemsIn(parsedManifest?.transactions_files as ReferencedFile[]);
        yield* this.itemsIn(parsedManifest?.stock_plans_files as ReferencedFile[]);
    }

    private *itemsIn(ocfFileReferences?: ReferencedFile[]): Generator<OCFObject> {
        for (const eachFile of ocfFileReferences || []) {
            // find filepath in full file set and load
            // console.log("this.files", this.allFiles);
            for (const f of this.allFiles) {
                if (f.path === eachFile.filepath) {
                    yield* this.items(f);
                    break;
                }
            }
        }
    }

    private *items(file: File): Generator<OCFObject> {
        try {
            // const parsedFile = JSON.parse(file.readAsText());
            const parsedFile = file;
            // @ts-ignore
            for (const item of parsedFile?.items || []) {
                if (isOCFObject(item)) {
                    yield item;
                } else {
                    Logger.warn("Encountered non-OCF object");
                }
            }
        } catch (e: unknown) {
            // TODO: LOG and skip? Fail?
        }
    }

    private static isDotJson(file: File): boolean {
        return file.path.toLowerCase().endsWith(".json");
    }

    private static underManifestSizeLimit(file: File): boolean {
        return file.sizeInBytes <= 50000;
    }

    private static couldBeManifestFile(file: File): boolean {
        try {
            // const parsedManifest = JSON.parse(file.readAsText());
            // console.log("parsedManifest", parsedManifest);
            // @ts-ignore
            return file?.file_type === "OCF_MANIFEST_FILE";
        } catch (e: unknown) {
            // TODO logging might be good
        }
        return false;
    }

    private constructor(public readonly manifestFile: any, private readonly allFiles: File[]) {
        // We parsed the file once before in `couldBeManifestFile`; we
        // could avoid that double parse
        // const parsedManifest = JSON.parse(manifestFile);

        this.asOfDate = new Date(manifestFile.as_of);
        this.generatedAtTimestamp = new Date(manifestFile.generated_at);
    }
}

export default OCFPackage;
