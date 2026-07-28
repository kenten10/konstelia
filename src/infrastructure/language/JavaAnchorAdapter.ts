import { parseJavaDocument } from "./LezerStructuralParsers";
import { StructuralSemanticAnchorAdapter } from "./StructuralSemanticAnchorAdapter";

export class JavaAnchorAdapter extends StructuralSemanticAnchorAdapter {
  public constructor() {
    super("Java", parseJavaDocument);
  }
}
