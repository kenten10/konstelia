import type {
  UpdateTourInput,
  UpdateTourResult,
  UpdateTourUseCase,
} from "../../application/tours/UpdateTour";
import type { TourValidationIssue } from "../../domain/tour/TourValidation";

/**
 * Saving from the editing screen happens long after the command returned, so the diagnostics
 * refresh that other commands do at registration time has to hang off the use case instead.
 */
export class RefreshDiagnosticsAfterUpdate implements UpdateTourUseCase {
  public constructor(
    private readonly updateTour: UpdateTourUseCase,
    private readonly refreshDiagnostics: () => Promise<void>,
  ) {}

  public validate(input: UpdateTourInput): Promise<readonly TourValidationIssue[]> {
    return this.updateTour.validate(input);
  }

  public async execute(input: UpdateTourInput): Promise<UpdateTourResult> {
    const result = await this.updateTour.execute(input);
    if (result.issues.length === 0) {
      await this.refreshDiagnostics();
    }
    return result;
  }
}
