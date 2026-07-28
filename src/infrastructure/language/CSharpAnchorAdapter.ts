import { StructuralSemanticAnchorAdapter } from "./StructuralSemanticAnchorAdapter";
import { parseCSharpDocument } from "./TextStructuralParsers";

export class CSharpAnchorAdapter extends StructuralSemanticAnchorAdapter {
  public constructor() {
    super("C#", parseCSharpDocument);
  }
}
