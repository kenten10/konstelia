import { StructuralSemanticAnchorAdapter } from "./StructuralSemanticAnchorAdapter";
import { parseRubyDocument } from "./TextStructuralParsers";

export class RubyAnchorAdapter extends StructuralSemanticAnchorAdapter {
  public constructor() {
    super("Ruby", parseRubyDocument);
  }
}
