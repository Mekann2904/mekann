# Skill Guide

**Version:** 1.0.0
**Last Updated:** 2026-02-14

This guide provides detailed documentation for all available skills in the project.

## Quick Reference

| Skill | Category | Primary Use Case |
|-------|----------|-----------------|
| [exploratory-data-analysis](#exploratory-data-analysis) | Analysis | Initial data exploration of scientific files |
| [research-critical](#research-critical) | Evaluation | Critical analysis and bias detection |
| [research-data-analysis](#research-data-analysis) | Core | Large-scale data processing with Dask/Polars |
| [research-hypothesis](#research-hypothesis) | Research | Hypothesis generation and validation |
| [research-literature](#research-literature) | Literature | Multi-database literature search |
| [research-ml-classical](#research-ml-classical) | ML | Classical machine learning algorithms |
| [research-ml-deep](#research-ml-deep) | ML | Deep learning with PyTorch |
| [research-ml-reinforcement](#research-ml-reinforcement) | ML | Reinforcement learning |
| [research-presentation](#research-presentation) | Communication | Slides and poster creation |
| [research-simulation](#research-simulation) | Simulation | Discrete-event and Monte Carlo simulation |
| [research-statistics](#research-statistics) | Statistics | Statistical analysis and testing |
| [research-time-series](#research-time-series) | Analysis | Time series classification/forecasting |
| [research-visualization](#research-visualization) | Visualization | Publication-quality figures |
| [research-writing](#research-writing) | Writing | Academic paper writing |

---

## exploratory-data-analysis

**Location:** `.pi/lib/skills/exploratory-data-analysis/`

### Description
Comprehensive EDA for 200+ scientific file formats. Automatically detects file format, performs format-specific analysis, generates quality assessment, statistical summaries, visualization recommendations, and downstream analysis suggestions in markdown reports.

### When to Use
- First analysis of a new scientific dataset
- Understanding file structure and content
- Quality assessment before analysis pipeline
- Working with unknown file formats

### Supported Format Categories
| Category | Formats | Example Extensions |
|----------|---------|-------------------|
| Chemistry/Molecular | 60+ | .pdb, .mol, .sdf, .xyz, .cif |
| Bioinformatics | 50+ | .fasta, .fastq, .bam, .vcf, .bed |
| Microscopy/Imaging | 45+ | .tif, .nd2, .czi, .dcm, .nii |
| Spectroscopy | 35+ | .mzML, .fid, .spc, .jdx, .raw |
| Proteomics/Metabolomics | 30+ | .mzML, .pepXML, .mzid, .mzTab |
| General Scientific | 30+ | .csv, .hdf5, .npy, .json, .parquet |

### Key Features
- Automatic format detection
- Format-specific metadata extraction
- Data quality and integrity assessment
- Statistical summary and distribution analysis
- Visualization recommendations
- Automatic markdown report generation

### Example Usage
```bash
# Direct skill invocation
/skill:exploratory-data-analysis data.fastq

# Python script execution
python scripts/eda_analyzer.py experiment.h5 report.md
```

### Required Libraries
```bash
# Core
uv pip install pandas numpy scipy

# Bioinformatics
uv pip install biopython pysam pybigwig

# Chemistry
uv pip install rdkit mdanalysis

# Imaging
uv pip install tifffile nd2reader aicsimageio pydicom scikit-image

# Mass spectrometry
uv pip install pymzml pyteomics matchms

# General
uv pip install h5py zarr openpyxl
```

### Output Structure
```markdown
# EDA Report: {filename}

## Executive Summary
## Basic Information
## Format Details
## Data Structure Analysis
## Statistical Summary
## Quality Assessment
## Recommendations
## Troubleshooting
```

---

## research-critical

**Location:** `.pi/lib/skills/research-critical/`

### Description
Critical thinking and scientific evaluation toolkit. Provides frameworks for evaluating scientific claims, detecting biases, assessing evidence quality using GRADE and Cochrane hierarchies.

### When to Use
- Paper review and peer review
- Research design validation
- Results interpretation with bias awareness
- Meta-analysis quality assessment

### Key Features
- Scientific claim structure analysis
- Evidence hierarchy evaluation (GRADE, Cochrane)
- Bias detection checklist
- Research design assessment (CONSORT, STROBE)
- Statistical interpretation guidance

### Evaluation Framework

#### GRADE Evidence Levels
| Level | Description | Reliability |
|-------|-------------|-------------|
| High | Further research unlikely to change conclusion | High |
| Moderate | Further research may change conclusion | Medium |
| Low | Further research likely to change conclusion | Low |
| Very Low | Conclusion very uncertain | Very Low |

#### Bias Checklist
```python
BIAS_CHECKLIST = {
    "selection_bias": ["Randomization adequate?", "Allocation concealed?"],
    "performance_bias": ["Participants blinded?", "Intervention providers blinded?"],
    "detection_bias": ["Outcome assessors blinded?", "Assessment methods objective?"],
    "attrition_bias": ["Follow-up rate >80%?", "ITT analysis used?"],
    "reporting_bias": ["All pre-registered outcomes reported?"]
}
```

### Example Usage
- Paper review: Check claim validity and evidence quality
- Research design: Validate experimental plan against CONSORT/STROBE
- Meta-analysis: Assess study quality for inclusion

---

## research-data-analysis

**Location:** `.pi/lib/skills/research-data-analysis/`

### Description
Enhanced EDA with large-scale data processing capabilities. Integrates Dask/Vaex for out-of-core computation, Polars for high-performance data manipulation, and Markitdown for format conversion.

### When to Use
- Large datasets that don't fit in memory
- High-performance data processing needs
- Format conversion between scientific formats
- Integration with exploratory-data-analysis workflows

### Key Features
- Out-of-core processing with Dask/Vaex
- Fast data manipulation with Polars
- Format conversion with Markitdown
- All features of exploratory-data-analysis

### Required Libraries
```bash
# Large-scale processing
uv pip install dask vaex polars

# Format conversion
uv pip install markitdown

# Core (from exploratory-data-analysis)
uv pip install pandas numpy scipy h5py
```

---

## research-hypothesis

**Location:** `.pi/lib/skills/research-hypothesis/`

### Description
Systematic hypothesis generation and validation system. Integrates LLM-driven automatic hypothesis testing (Hypogenic), creative research idea generation, and structured hypothesis construction from observations.

### When to Use
- Generating hypotheses from observations
- Designing validation experiments
- Creative research ideation
- Converting observations to testable hypotheses

### Key Features
- Structured hypothesis formulation
- LLM-driven hypothesis testing
- Prediction generation
- Experimental design support
- Observation-to-hypothesis conversion

### Workflow
```
Observation -> Hypothesis Formulation -> Prediction Generation -> Experimental Design -> Validation
```

---

## research-literature

**Location:** `.pi/lib/skills/research-literature/`

### Description
Integrated literature search and management system. Searches PubMed, arXiv, bioRxiv, Semantic Scholar; manages BibTeX citations; retrieves current research via Perplexity AI.

### When to Use
- Conducting literature reviews
- Managing citations
- Finding recent publications
- Systematic review preparation

### Key Features
- Multi-database search (PubMed, arXiv, bioRxiv, Semantic Scholar)
- BibTeX citation management
- Perplexity AI integration for current research
- Multiple citation styles (APA, Nature, Vancouver)
- Verified citation generation

### Supported Databases
- PubMed (biomedical)
- arXiv (preprints)
- bioRxiv (biology preprints)
- Semantic Scholar (AI-powered search)

### Citation Styles
- APA 7th Edition
- Nature
- Vancouver
- IEEE
- Chicago

---

## research-ml-classical

**Location:** `.pi/lib/skills/research-ml-classical/`

### Description
Classical machine learning toolkit. Integrates supervised/unsupervised learning, model interpretability (SHAP), and dimensionality reduction (UMAP).

### When to Use
- Traditional ML workflows
- Model interpretation and explanation
- Dimensionality reduction
- Feature importance analysis

### Key Features
- Supervised learning (classification, regression)
- Unsupervised learning (clustering, dimensionality reduction)
- Model interpretability with SHAP
- UMAP for visualization

### Required Libraries
```bash
uv pip install scikit-learn shap umap-learn
```

### Capabilities
| Task | Algorithms |
|------|------------|
| Classification | SVM, Random Forest, Gradient Boosting, etc. |
| Regression | Linear, Ridge, Lasso, etc. |
| Clustering | K-Means, DBSCAN, Hierarchical |
| Dimensionality Reduction | PCA, UMAP, t-SNE |
| Interpretability | SHAP values, feature importance |

---

## research-ml-deep

**Location:** `.pi/lib/skills/research-ml-deep/`

### Description
Deep learning toolkit. Integrates PyTorch Lightning, Transformers, and Graph Neural Networks for NLP, computer vision, and graph analysis.

### When to Use
- Deep learning model development
- NLP tasks
- Computer vision
- Graph neural networks
- Transfer learning

### Key Features
- PyTorch Lightning for training
- HuggingFace Transformers for NLP
- Graph Neural Networks
- Transfer learning support

### Required Libraries
```bash
uv pip install torch pytorch-lightning transformers torch-geometric
```

### Domain Support
| Domain | Capabilities |
|--------|--------------|
| NLP | Text classification, NER, QA, summarization |
| Computer Vision | Classification, detection, segmentation |
| Graph | Node classification, link prediction, graph classification |

---

## research-ml-reinforcement

**Location:** `.pi/lib/skills/research-ml-reinforcement/`

### Description
Reinforcement learning toolkit. Integrates Stable Baselines3 for standard RL and PufferLib for high-performance parallel training.

### When to Use
- Training RL agents
- Game AI development
- Robotics control
- Resource optimization

### Key Features
- Standard RL algorithms (PPO, SAC, DQN, etc.)
- High-performance parallel training
- Custom environment support
- Monitoring and logging

### Required Libraries
```bash
uv pip install stable-baselines3 gymnasium puff.erlib
```

### Algorithms
| Type | Algorithms |
|------|------------|
| On-policy | PPO, A2C, TRPO |
| Off-policy | SAC, TD3, DDPG, DQN |
| Multi-agent | (via custom implementation) |

---

## research-presentation

**Location:** `.pi/lib/skills/research-presentation/`

### Description
Research presentation toolkit. Creates slides, posters, and LaTeX Beamer presentations for conferences, seminars, and poster sessions.

### When to Use
- Conference presentations
- Seminar talks
- Poster sessions
- Academic defense preparation

### Key Features
- Slide deck creation
- Scientific poster design
- LaTeX Beamer support
- Conference-specific templates

### Output Formats
- PowerPoint/Google Slides (outline)
- LaTeX Beamer
- HTML slides (reveal.js)
- PDF posters

---

## research-simulation

**Location:** `.pi/lib/skills/research-simulation/`

### Description
Simulation and optimization toolkit. Integrates discrete-event simulation, multi-objective optimization, and symbolic computation.

### When to Use
- Process simulation
- System modeling
- Optimization problems
- Monte Carlo studies

### Key Features
- Discrete-event simulation (SimPy)
- Multi-objective optimization
- Symbolic computation (SymPy)
- Monte Carlo methods

### Required Libraries
```bash
uv pip install simpy scipy sympy deap
```

### Capabilities
| Type | Use Case |
|------|----------|
| Discrete-event | Queue systems, manufacturing, logistics |
| Monte Carlo | Uncertainty quantification, risk analysis |
| Optimization | Parameter tuning, design optimization |
| Symbolic | Mathematical derivation, equation solving |

---

## research-statistics

**Location:** `.pi/lib/skills/research-statistics/`

### Description
Integrated statistical analysis system. Combines frequentist statistics, Bayesian inference, survival analysis, and APA-formatted reporting.

### When to Use
- Statistical testing
- Regression analysis
- Bayesian modeling
- Survival analysis
- Report writing

### Key Features
- Frequentist statistics (tests, regression, time series)
- Bayesian inference (MCMC, hierarchical models)
- Survival analysis (Cox, RSF)
- APA-formatted reports

### Required Libraries
```bash
uv pip install scipy statsmodels pymc arviz lifelines
```

### Analysis Types
| Category | Methods |
|----------|---------|
| Tests | t-test, ANOVA, chi-square, non-parametric |
| Regression | Linear, logistic, mixed-effects |
| Bayesian | MCMC, hierarchical models |
| Survival | Kaplan-Meier, Cox, RSF |

---

## research-time-series

**Location:** `.pi/lib/skills/research-time-series/`

### Description
Time series machine learning toolkit. Specialized in classification, regression, clustering, forecasting, and anomaly detection using the aeon library.

### When to Use
- Time series classification
- Forecasting
- Anomaly detection
- Temporal clustering

### Key Features
- Classification and regression
- Clustering and segmentation
- Forecasting
- Anomaly detection

### Required Libraries
```bash
uv pip install aeon
```

### Capabilities
| Task | Methods |
|------|---------|
| Classification | ROCKET, InceptionTime, etc. |
| Regression | Time series regression |
| Clustering | k-means, k-medoids, hierarchical |
| Forecasting | ARIMA, exponential smoothing |
| Anomaly | Isolation forest, deep learning |

---

## research-visualization

**Location:** `.pi/lib/skills/research-visualization/`

### Description
Integrated visualization system. Creates static plots (matplotlib/seaborn), interactive visualizations (plotly), and publication-quality figures (Nature/Science/Cell format).

### When to Use
- Exploratory visualization
- Publication figure preparation
- Interactive dashboards
- Multi-panel layouts

### Key Features
- Static plots with matplotlib/seaborn
- Interactive plots with plotly
- Publication-quality formatting
- Multi-panel layouts
- Color-blind safe palettes
- Journal-specific templates

### Required Libraries
```bash
uv pip install matplotlib seaborn plotly kaleido
```

### Journal Support
| Journal | Requirements |
|---------|--------------|
| Nature | AI/EPS format, specific dimensions |
| Science | TIFF/EPS, resolution requirements |
| Cell | TIFF, specific sizing |

### Capabilities
- Multi-panel figure composition
- Statistical annotations
- Color-blind safe palettes
- Export to multiple formats (PDF, SVG, PNG, TIFF)

---

## research-writing

**Location:** `.pi/lib/skills/research-writing/`

### Description
Core research writing skill. Writes scientific papers in complete paragraphs (not bullet points), uses IMRAD structure, and supports multiple citation formats and reporting guidelines.

### When to Use
- Writing research papers
- Preparing journal submissions
- Literature review writing
- Thesis/dissertation chapters

### Key Features
- Full paragraph writing (no bullet points)
- Two-stage process: outline then prose
- IMRAD structure support
- Multiple citation formats
- Reporting guideline compliance

### Process
```
1. Create section outline with bullet points
2. Convert outline to flowing prose
3. Add citations and references
4. Format per journal requirements
```

### Supported Guidelines
- CONSORT (RCTs)
- STROBE (observational studies)
- PRISMA (systematic reviews)
- ARRIVE (animal studies)

### Citation Formats
- APA 7th Edition
- AMA
- Vancouver
- Journal-specific formats

---

## Using Skills in Practice

### For Lead Agents

When delegating tasks, specify relevant skills:

```
Task: Analyze the gene expression data and prepare visualization
Skills: research-data-analysis, research-statistics, research-visualization
```

### For Subagents

Skills are listed in the prompt as assigned skills:

```
Assigned skills:
- research-statistics
- research-visualization
```

Subagents receive skill names in the prompt. To use a skill, read its SKILL.md file:
- Path format: `.pi/lib/skills/{skill-name}/SKILL.md`
- Example: `.pi/lib/skills/research-statistics/SKILL.md`

### For Team Members

Skills are listed in Japanese locale:

```
割り当てスキル:
- research-literature
- research-critical
```

Common skills are shared across all members; individual skills provide specialization:

```
Team Common: research-literature
Member A: research-statistics, research-visualization
Member B: research-critical, research-writing
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Skill not loaded | Missing/invalid frontmatter | Add `name` and `description` fields |
| Missing library | Python dependency not installed | Run `uv pip install <package>` |
| Format not recognized | Unsupported file format | Check format list or extend skill |
| Large file error | Memory limitation | Use sampling or chunk processing |

### Getting Help

1. Check the skill's `SKILL.md` for specific troubleshooting
2. Review reference files in `references/` subdirectory
3. Consult `.pi/docs/skill-management-architecture.md` for system details
4. Check `.pi/lib/skill-registry.ts` for resolution logic

---

*This guide covers all 14 available skills (13 research-* skills plus exploratory-data-analysis).*
*For operational procedures, see `.pi/docs/skill-management-architecture.md`.*
