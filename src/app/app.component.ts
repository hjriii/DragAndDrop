import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { NgxDropzoneModule, NgxDropzoneChangeEvent } from 'ngx-dropzone';

// アップロード対象のファイル＆ディレクトリとアップロード先のパスを保持する
export class UploadFile {
  uploadPath: string;
  file: File; // ディレクトリの場合、名前以外は使用不可
  constructor(file: File, uploadPath: string) {
    this.file = file;
    this.uploadPath = uploadPath;
  }

  isFile(): boolean {
    return this.file.size > 0;
  }
  getDisplayName(): string {
    return this.uploadPath + this.file.name;
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, NgxDropzoneModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {

  public globalLoadingSubject: Subject<boolean> = new Subject<boolean>();
  public files: UploadFile[] = [];
  public errorType: string = '';
  public isVisible: boolean = false;

  ngOnInit() {
    console.log('onInit');
    // フォルダ選択ダイアログはChromeとEdgeしか動作しないため、他のブラウウザはボタンを非表示にする
    const CHROME = 'Google Chrome';
    const EDGE = 'Microsoft Edge';
    const userAgentData = (window as any).navigator?.userAgentData;
    if (userAgentData?.brands.length) {
      userAgentData.brands.map(
        (data: any) => {
          if (data.brand === CHROME || data.brand === EDGE) {
            this.isVisible = true;
          }
        }
      );
    }
  }

  // フォルダ選択ダイアログ
  onClickSelectDirectory() {
    console.log('onClickSelectDirectory start');
    this.globalLoadingSubject.next(true);
    this.selectDirectoryProcess();
    this.globalLoadingSubject.next(false);
    console.log('onClickSelectDirectory end');
  }

  selectDirectoryProcess = async () => {
    const tmpFiles: UploadFile[] = [];
    // フォルダ選択ダイアログ表示
    const showDirectoryPicker = async () => {
      // ディレクトリ階層を辿っていく再帰呼び出し
      const searchDirectory = async (path: string, baseHandle: any) => {
        for await (const [name, handle] of baseHandle.entries()) {
          // ファイル
          if (handle.kind === 'file') {
            // ハンドルからFileを取得
            const file: File = await handle.getFile();
            tmpFiles.push(new UploadFile(file, path));
          }
          // ディレクトリ
          else {
            tmpFiles.push(new UploadFile(new File([], handle.name), path));
            await searchDirectory(path + name + '/', handle);
          }
        }
      };
      // フォルダ選択ダイアログを表示
      const baseHandle = await (window as any).showDirectoryPicker();
      await searchDirectory('', baseHandle);
    };
    // 本処理
    await showDirectoryPicker();
    tmpFiles.forEach((file) => {
      this.files.push(file);
    })
  }

  dragOver(event: DragEvent) {
    console.log('dragOver start');
    // ブラウザでファイルを開かないようにする
    // ここを設定しないと、drop時でもブラウザでファイルが開かれてしまう
    event.preventDefault();
    console.log('dragOver end');
  }

  drop(event: DragEvent) {
    console.log('drop start');
    // ブラウザでファイルを開かないようにする
    event.preventDefault();
    this.dropProcess(event);
    console.log('drop end');
  }

  dropProcess = async (event: DragEvent) => {
    // --- ここから処理の準備
    const tmpFiles: UploadFile[] = [];
    // ファイルおよびディレクトリの検索（再帰呼び出し）
    // entryはFileSystemFileEntryもしくはFileSystemDirectoryEntry
    const recursiveSearchFileAndDir = async (path: string, entry: any) => {
      // ファイル
      if (entry.isFile) {
        const file: File = await new Promise<File>((resolve) => {
          entry.file((file: File) => { resolve(file) })
        });
        tmpFiles.push(new UploadFile(file, path));
      }
      // ディレクトリ
      else if (entry.isDirectory) {
        tmpFiles.push(new UploadFile(new File([], entry.name), path));
        let tmpEntries: FileSystemEntry[] = [];

        const readEntries = async (argEntry: any) => {
          // dirReader.readEntriesでは一度にすべてのエントリを取得できないため
          // recursiveReadEntriesを再帰呼び出しして全エントリを取得する
          const readEntries: FileSystemEntry[] = await recursiveReadEntries(argEntry);
          if (readEntries.length > 0) {
            tmpEntries = [...tmpEntries, ...readEntries];
            await recursiveReadEntries(argEntry);
          }
        };

        const recursiveReadEntries = (argEntry: any) => new Promise<FileSystemEntry[]>((resolve) => {
          const dirReader = argEntry.createReader();
          dirReader.readEntries((entries: FileSystemEntry[]) => {
            resolve(entries);
          });
        });

        await readEntries(entry);
        for (const e of tmpEntries) {
          await recursiveSearchFileAndDir(path + entry.name + '/', e);
        };
      }
    }
    // --- ここまで処理の準備

    // 本体
    const dataTransfer = event.dataTransfer;
    if (dataTransfer) {
      const items: DataTransferItemList = dataTransfer.items;
      const promises: Promise<void>[] = Array.from(items).map((item) => {
        return new Promise((resolve) => {
          const entry: FileSystemEntry | null = item.webkitGetAsEntry();
          // nullの時は何もしない
          if (!entry) {
            resolve;
            return;
          }
          resolve(recursiveSearchFileAndDir('', entry));
        });
      });
      await Promise.all(promises);
      tmpFiles.forEach((file) => {
        this.files.push(file);
      })
    }
  }

  // ファイル選択ダイアログ
  onClickSelectFile(dropzone: any) {
    dropzone.showFileSelector()
  }

  // ファイル選択ダイアログでファイルを選択した後に実行される処理
  public async onChangeDropZone(event: NgxDropzoneChangeEvent): Promise<void> {
    console.log(event);

    console.log('onChangeDropZone start');
    if (event.rejectedFiles.length > 0) {
      event.rejectedFiles.forEach((file) => {
        console.log(file);
      });
    }

    if (event.addedFiles.length > 0) {
      this.globalLoadingSubject.next(true);
      event.addedFiles.forEach((file) => {
        this.files.push(new UploadFile(file, ''));
      });
    }
    this.globalLoadingSubject.next(false);
    console.log('onChangeDropZone end');
  }

}

