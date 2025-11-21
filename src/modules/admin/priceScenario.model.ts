import { Schema, model, Document } from 'mongoose';

export interface IPriceScenario extends Document {
  symbol: string;
  startTime: Date;
  endTime: Date;
  startPrice: number;
  endPrice: number;
  highPrice: number;
  lowPrice: number;
  isActive: boolean;
}

const priceScenarioSchema = new Schema<IPriceScenario>({
  symbol: { type: String, required: true, uppercase: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  startPrice: { type: Number, required: true },
  endPrice: { type: Number, required: true },
  highPrice: { type: Number, required: true },
  lowPrice: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

// Validate that high is highest and low is lowest, etc.
priceScenarioSchema.pre('save', function(next) {
  if (this.highPrice < this.startPrice || this.highPrice < this.endPrice) {
    next(new Error('High price must be greater than or equal to start and end prices'));
  } else if (this.lowPrice > this.startPrice || this.lowPrice > this.endPrice) {
    next(new Error('Low price must be less than or equal to start and end prices'));
  } else if (this.startTime >= this.endTime) {
    next(new Error('Start time must be before end time'));
  } else {
    next();
  }
});

const PriceScenario = model<IPriceScenario>('PriceScenario', priceScenarioSchema);

export default PriceScenario;
