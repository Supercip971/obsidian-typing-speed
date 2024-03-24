import { App, Editor, editorViewField, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface TypingSpeedSettings {
	metrics: string;
	darken_after_pausing: boolean;
	monkeytype_counting: boolean;
	show_minmax: boolean;
}

const DEFAULT_SETTINGS: TypingSpeedSettings = {
	metrics: 'wpm',
	darken_after_pausing: true,
	monkeytype_counting: true,
	show_minmax: false,
}

interface MinMaxVals {
	min: number;
	max: number;
}

function getMetricFactor(metric: String): number {
	switch (metric) {
		case 'cpm':
		case 'wpm':
			return 60.0;
		case 'cps':
			return 1.0;
	}
}

function average_array(array: number[]): number {
	var avg = 0;
	array.forEach((val: number, idx: number) => {
		avg += val;
	});

	return avg / array.length;
}

function minmax_in_array(array: number[]):MinMaxVals {
	
	var min_val = 10000.0;
	var max_val = 0.0;
	var blurred_array = [];
	for(var i = 1; i < array.length - 1; i++)
	{
		var val = (array[i]+array[i+1] +array[i-1])/3;
		blurred_array.push(val);
	}

	blurred_array.forEach((val: number, idx: number) => {
		max_val = Math.max(val, max_val);
		min_val = Math.min(val, min_val);
	});

	return {min: min_val, max: max_val};
	
}


function array_shiftadd(array: number[], value: number): number[] {
	for (var i = 0; i < array.length - 1; i++) {
		array[i] = array[i + 1];
	}
	array[array.length - 1] = value;
	return array;
}
export default class TypingSpeedPlugin extends Plugin {
	settings: TypingSpeedSettings;

	Typed: number[] = [0];


	pollings_in_seconds: number = 1.0;
	keyTypedInSecond: number = 0;
	wordTypedInSecond: number = 0;
	keyTypedSinceSpace: number = 0;

	statusBarItemEl: HTMLElement;

	// if in the last 2 seconds the user was not typing, just stop counting
	hasStoppedTyping(typed: number[]): Boolean {

		const second_check = 2 * this.pollings_in_seconds;
		const check_start = typed.length - second_check;

		if (check_start < 0) {
			return false;
		}

		for (var i = check_start; i < typed.length; i++) {
			if (typed[i] != 0) {
				return false;
			}
		}
		return true;
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
				if(this.settings.monkeytype_counting)
				{
					this.wordTypedInSecond += (this.keyTypedSinceSpace+1)/5.0;
				}
				else {
					this.wordTypedInSecond += 1.0;
				}
				this.keyTypedSinceSpace = 0;
			}

		});

		this.registerInterval(window.setInterval(() => {

			var average = 0;
			var fact = getMetricFactor(this.settings.metrics);
			var added = 0;
			var min_val = 0;
			var max_val = 0;

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

				if(this.Typed.length > this.pollings_in_seconds * 10)
				{
					array_shiftadd(this.Typed, added);
				}
				else {
					this.Typed.push(added);
				}
				average = Math.round(average_array(this.Typed) * (fact));

				// avoid showing minmax if the setting is disabled 
				if(this.settings.show_minmax)
				{
					var {min: min_avg, max: max_avg} = minmax_in_array(this.Typed);
					min_val = Math.round(min_avg * (fact));
					max_val = Math.round(max_avg * (fact));
				}

				if (this.settings.darken_after_pausing) {
					this.statusBarItemEl.style.opacity = "100%";
				}
			}
			else {
				if (this.settings.darken_after_pausing) {

					this.statusBarItemEl.style.opacity = "50%";
				}
			}
			

			var final_str = average + ' ' + this.settings.metrics;
			if(this.settings.show_minmax)
			{
				final_str += ' (' + min_val + '-' + max_val + ')';
			}
			this.statusBarItemEl.setText(final_str);
		}, 1000 / this.pollings_in_seconds ));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if(this.settings.monkeytype_counting == undefined)
		{
			this.settings.monkeytype_counting = DEFAULT_SETTINGS.monkeytype_counting;
		}
		if(this.settings.show_minmax == undefined)
		{
			this.settings.show_minmax = DEFAULT_SETTINGS.show_minmax;
		}
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

		new Setting(containerEl)
			.setName('Normalize word counting')
			.setDesc('Replicate the word counting functionality of MonkeyType by considering each word as the number of characters divided by 5. While this method may not be as precise for direct word counting, it accounts for the varying lengths of words.')
			.addToggle(bool => bool
				.setValue(true)
				.onChange(async (value) => {
					this.plugin.settings.monkeytype_counting = value;
					await this.plugin.saveSettings();
				})
			);
		
		new Setting(containerEl)
			.setName('Show min-max typing speed')
			.setDesc('Present the lowest and highest typing speeds observed, focusing specifically on the worst and best speeds recorded within 3-second intervals. Note that there is more numbers shifting per second so it may be more distracting')
			.addToggle(bool => bool
				.setValue(false)
				.onChange(async (value) => {
					this.plugin.settings.show_minmax = value;
					await this.plugin.saveSettings();
				})
			);
		
		}
}
