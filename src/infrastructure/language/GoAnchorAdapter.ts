import { StructuralSemanticAnchorAdapter } from "./StructuralSemanticAnchorAdapter";
import { parseGoDocument } from "./LezerStructuralParsers";

export class GoAnchorAdapter extends StructuralSemanticAnchorAdapter {
  public constructor() {
    super("Go", parseGoDocument);
  }
}
