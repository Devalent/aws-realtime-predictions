export type ModelEndpoint = {
  campaign:string;
  model:string;
  modified:number;
  columns:string[];
  classes:{ [x:string]:string; };
};

export type PredictionSource = {
  ip?:string;
  country?:string;
  city?:string;
  isp?:string;
  network?:string;
  long?:number;
  lat?:number;
  dos?:string;
  dtype?:string;
  dosversion?:string;
  dbrowser?:string;
  dbrowserversion?:string;
};
