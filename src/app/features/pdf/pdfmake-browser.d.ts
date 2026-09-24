declare module 'pdfmake/build/pdfmake.js' {
  const pdfMake: { addVirtualFileSystem(files: Record<string, string>): void; createPdf(document: unknown): { getBlob(): Promise<Blob> } };
  export default pdfMake;
}
declare module 'pdfmake/build/vfs_fonts.js' {
  const files: Record<string, string>;
  export default files;
}
