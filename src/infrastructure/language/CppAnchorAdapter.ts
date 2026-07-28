import { parseCppDocument } from "./LezerStructuralParsers";
import { StructuralSemanticAnchorAdapter } from "./StructuralSemanticAnchorAdapter";

export class CppAnchorAdapter extends StructuralSemanticAnchorAdapter {
  public constructor(languageName: "C" | "C++") {
    super(languageName, parseCppDocument);
  }
}
