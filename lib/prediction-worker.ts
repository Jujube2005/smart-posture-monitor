import model from "@/lib/posture-model.json";

export type Prediction = { posture: string; confidence: number };

type SerializedTree = {
  left: number[];
  right: number[];
  feature: number[];
  threshold: number[];
  value: number[][];
};

type SerializedForest = { classes: string[]; trees: SerializedTree[] };
const forest = model as SerializedForest;

/** Evaluate the exported scikit-learn RandomForestClassifier without Python. */
export function predictPosture(values: [number, number, number]): Prediction {
  const probabilities = new Array<number>(forest.classes.length).fill(0);

  for (const tree of forest.trees) {
    let node = 0;
    while (tree.left[node] !== -1) {
      const feature = tree.feature[node];
      node = values[feature] <= tree.threshold[node] ? tree.left[node] : tree.right[node];
    }

    const classCounts = tree.value[node];
    const total = classCounts.reduce((sum, count) => sum + count, 0);
    if (total <= 0) throw new Error("Posture model contains an empty leaf");
    for (let i = 0; i < probabilities.length; i++) {
      probabilities[i] += classCounts[i] / total / forest.trees.length;
    }
  }

  let best = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[best]) best = i;
  }
  return { posture: forest.classes[best], confidence: probabilities[best] };
}
