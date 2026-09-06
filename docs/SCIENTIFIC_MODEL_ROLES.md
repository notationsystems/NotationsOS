# Scientific model roles

## Mandate and boundary

Notation Systems builds provenance-bearing computational corpora for the physical economy. APIs, feeds, reports, workbenches, and MCP tools distribute that inventory to brokers, asset and portfolio managers, and insurance and financing firms. Customers can apply their own inference to those streams; supplying an API does not require supplying a learned model.

Scientific models are specialized computation over permitted inputs, not a replacement for the information-production system. Customer evidence, customer workloads, and proprietary-capital activity retain their separate boundaries. Observations, assumptions, predictions, and operator interpretations remain distinguishable. A prediction never grants canonical admission or distribution rights.

The [clearance measurement-design experiment](CLEARANCE_VOI.md) adds exact finite Bayesian decision analysis over a declared joint model. It evaluates expected decision-loss reduction minus acquisition cost without executing an action. A dependency representation is not proof of a Markov blanket; this experiment implements neither variational free-energy minimization nor an active-inference policy. The synthetic inspector separates hypothetical belief changes, model-expected performance and still-unresolved independent reference validation.

## Different methods answer different questions

| Family | Role and distinction |
| --- | --- |
| PINN | A neural model trained with governing-equation residuals alongside applicable measurements and boundary/initial conditions. A defined physical equation and identifiable unknown are prerequisites. |
| gPINN | Gradient-enhanced PINN: adds derivatives of the equation residual to the training objective. It is not a Gaussian process or a synonym for graph-based physics. |
| Gaussian process | A probabilistic model over functions, specified by mean and covariance functions. Its predictive uncertainty is conditional on the chosen model and noise assumptions. |
| GNN | A learned computation over graph relationships. Building adjacency, transport connectivity, and finite-element mesh edges retain different meanings. Direct connectivity or shortest-path calculations do not require training. |
| Neural operator | Learns a mapping between input and output functions across a family of problems. Potential repeated-scenario acceleration must be established within a validated domain, not inferred from a single successful solution. |
| Factor graph | Represents probabilistic constraints over unknown state. A conventional solver can estimate that state without training a neural network. |

The definitions follow the [gPINN paper](https://arxiv.org/abs/2111.02801), [Gaussian-process regression text](https://gaussianprocess.org/gpml/chapters/RW2.pdf), [MeshGraphNets paper](https://arxiv.org/abs/2010.03409), [Fourier Neural Operator paper](https://arxiv.org/abs/2010.08895), and [GTSAM introduction](https://gtsam.org/tutorials/intro.html).

## The BIM transformer is not a trained neural model

Source inspection uses GAT commit `80272f94107cce4f70c81e57915800b04c5944a6`, the existing [local integration pin](GAT_INSPECTOR.md), not a moving or newly adopted engine.

The inspected, pinned GAT runtime uses Gaussian conditioning and dependency-graph propagation. Derived covariance is a first-order pushforward through declared Jacobians; its analytic structural-attention implementation explicitly has no learned parameters. These are source-code observations, not independent physical validation. Relevant runtime modules are `gat/gaussian/condition.py`, `gat/engine/propagate.py`, and `gat/geometry/attention.py`.

A future physical model can consume versioned geometry and observations and return a predicted field or parameter with its assumptions and checks. It must not relabel model-derived alignment as independent measurement evidence against that same model.

## First conventional benchmark

The first local baseline is a bounded scalar linear-Gaussian estimator with evidence-linked inputs and held-out-reference metrics. Its demonstration is explicitly `SYNTHETIC_TEST`: analytic data with declared noise assumptions. It checks numerical behavior and inspectability, not real sensor accuracy. It is not 3D fusion, SLAM, GTSAM integration, a trained model, or a completed physical benchmark.

Absolute observations or explicit priors must anchor each connected component. Marginal variance comes from the inverse joint information matrix, not the reciprocal of its diagonal. Posterior states can be correlated even when measurement errors are independent. Missing variance remains missing; correlated or unresolved errors are not silently treated as independent. Singular or unsupported configurations require refusal, not invented certainty.

Before a real benchmark can qualify, it still needs measured noise, calibrated frames and clocks, source authority, and independently characterized reference uncertainty. Held-out references must not influence estimation, calibration, association selection, or parameter tuning. Distinct identifiers alone do not establish independence. Shared corrections and calibration can introduce correlation.

## Subsequent learned experiments

Predeclare the task, conventional comparison, accuracy/runtime/failure metrics, and split by held-out sites, sessions, geometries, or operating conditions before choosing a learned approach. Random samples from one recording do not establish cross-session generalization. Report exactly what runtime includes.

Each result identifies inputs, model/version, assumptions, validation domain, and uncertainty method. Physics-informed training is not proof of physical correctness: documented [PINN failure modes](https://arxiv.org/abs/2109.01050) make independent checks necessary. No framework installation, model training, learned-model validation, or automatic admission is claimed here.
