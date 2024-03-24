import { App, Editor, editorViewField, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface TypingSpeedSettings {
	metrics: string;
	darken_after_pausing: boolean;
}

const DEFAULT_SETTINGS: TypingSpeedSettings = {
	metrics: 'wpm',
	darken_after_pausing: true,
}

function getMetricFactor(metric: String): number {
	switch (metric) {
		case 'cpm':
		case 'wpm':
			return 60;
		case 'cps':
			return 1;
	}
}

function average_array(array: number[]): number {
	var avg = 0;
	array.forEach((val: number, idx: number) => {
		avg += val;
	});

	return avg / array.length;
}

export default class TypingSpeedPlugin extends Plugin {
	settings: TypingSpeedSettings;

	Typed: number[] = [0];


	accumulatedSeconds: number = 10;
	keyTypedInSecond: number = 0;
	wordTypedInSecond: number = 0;
	keyTypedSinceSpace: number = 0;

	statusBarItemEl: HTMLElement;

	// if in the last 2 seconds the user was not typing, just stop counting
	hasStoppedTyping(typed: number[]): Boolean {
		const check_start = typed.length - 2;

		if (check_start < 0) {
			return false;
		}

		const sum_last_three = typed[check_start] + typed[check_start + 1];

		return sum_last_three == 0;
	}

	async onload() {
		await this.loadSettings();

		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.setText('');

		this.addSettingTab(new TypingSpeedSettingTab(this.app, this));

		this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {

			// only some key are valid
			const keyRegex: RegExp = /^[\p{L},;1-9]$/gu;

			if (evt.key.match(keyRegex)) {
				this.keyTypedInSecond += 1;
				this.keyTypedSinceSpace += 1;
			}

			if (evt.key == ' ' && this.keyTypedSinceSpace != 0) {
				this.wordTypedInSecond += 1;
				this.keyTypedSinceSpace = 0;
			}

		});

		this.registerInterval(window.setInterval(() => {

			var average = 0;
			var fact = getMetricFactor(this.settings.metrics);
			var added = 0;

			if (this.settings.metrics == 'cps' || this.settings.metrics == 'cpm') {
				added = this.keyTypedInSecond;
				this.keyTypedInSecond = 0;
			}
			else if (this.settings.metrics == 'wpm') {
				added = this.wordTypedInSecond;
				this.wordTypedInSecond = 0;
			}


			if (!this.hasStoppedTyping(this.Typed) || added != 0) {

				if(this.hasStoppedTyping(this.Typed))
				{
					this.Typed = [];
				}
				if (this.Typed.push(added) > this.accumulatedSeconds) {
					this.Typed.shift();
				}
				average = Math.round(average_array(this.Typed) * fact);

				if (this.settings.darken_after_pausing) {
					this.statusBarItemEl.style.opacity = "100%";
				}
			}
			else {
				if (this.settings.darken_after_pausing) {

					this.statusBarItemEl.style.opacity = "50%";
				}
			}


			this.statusBarItemEl.setText(average + ' ' + this.settings.metrics);
		}, 1000));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class TypingSpeedSettingTab extends PluginSettingTab {
	plugin: TypingSpeedPlugin;

	constructor(app: App, plugin: TypingSpeedPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for typing-speed plugin' });

		new Setting(containerEl)
			.setName('Darken after 3 sec')
			.setDesc('When you stop writing, after 3 seconds the typing speed display will darken.')
			.addToggle(bool => bool
				.setValue(true)
				.onChange(async (value) => {
					this.plugin.settings.darken_after_pausing = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Typing speed metric')
			.setDesc('choose which metric to use for typing speed')
			.addDropdown(text => text
				.addOption('wpm', 'word per minute')
				.addOption('cps', 'character per second')
				.addOption('cpm', 'character per minute')
				.setValue(this.plugin.settings.metrics)
				.onChange(async (value) => {
					this.plugin.settings.metrics = value;
					this.plugin.Typed = [0];
					await this.plugin.saveSettings();
				}));
	}
}
